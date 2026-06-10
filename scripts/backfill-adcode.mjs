/**
 * 回填脚本：为历史 Place 记录补齐行政区划 adcode（provinceId / cityId）。
 *
 * 仅处理 provinceId IS NULL 且存在 city/province 文本的记录，按省/市名称字典归一化。
 * 幂等：已有 provinceId 的记录不再处理；重复运行不会改变结果。
 *
 * 运行：
 *   node --env-file=apps/api/.env scripts/backfill-adcode.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 省级 adcode（首两位 + '0000'）。
const PROVINCE_ADCODE = {
  北京: '110000', 天津: '120000', 河北: '130000', 山西: '140000', 内蒙古: '150000',
  辽宁: '210000', 吉林: '220000', 黑龙江: '230000', 上海: '310000', 江苏: '320000',
  浙江: '330000', 安徽: '340000', 福建: '350000', 江西: '360000', 山东: '370000',
  河南: '410000', 湖北: '420000', 湖南: '430000', 广东: '440000', 广西: '450000',
  海南: '460000', 重庆: '500000', 四川: '510000', 贵州: '520000', 云南: '530000',
  西藏: '540000', 陕西: '610000', 甘肃: '620000', 青海: '630000', 宁夏: '640000',
  新疆: '650000', 台湾: '710000', 香港: '810000', 澳门: '820000',
};

// 省会 + 直辖市 + 少数重点城市。
const CITY_ADCODE = {
  北京: '110100', 天津: '120100', 上海: '310100', 重庆: '500100',
  石家庄: '130100', 太原: '140100', 呼和浩特: '150100', 沈阳: '210100', 长春: '220100',
  哈尔滨: '230100', 南京: '320100', 杭州: '330100', 合肥: '340100', 福州: '350100',
  南昌: '360100', 济南: '370100', 郑州: '410100', 武汉: '420100', 长沙: '430100',
  广州: '440100', 南宁: '450100', 海口: '460100', 成都: '510100', 贵阳: '520100',
  昆明: '530100', 拉萨: '540100', 西安: '610100', 兰州: '620100', 西宁: '630100',
  银川: '640100', 乌鲁木齐: '650100', 深圳: '440300', 宁波: '330200',
};

const SUFFIXES = [
  '维吾尔自治区', '壮族自治区', '回族自治区', '特别行政区', '自治区', '自治州', '自治县',
  '维吾尔', '壮族', '回族', '苗族', '彝族', '藏族', '蒙古', '省', '市', '区', '县',
];

function normalize(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of SUFFIXES) {
      if (s.length > suffix.length && s.endsWith(suffix)) {
        s = s.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }
  return s;
}

function lookup(name, dict) {
  if (!name) return null;
  if (dict[name]) return dict[name];
  for (const key of Object.keys(dict)) {
    if (name.includes(key) || key.includes(name)) return dict[key];
  }
  return null;
}

function resolveAdcode(province, city) {
  const p = normalize(province);
  const c = normalize(city);
  let provinceId = lookup(p, PROVINCE_ADCODE);
  const cityId = lookup(c, CITY_ADCODE);
  if (!provinceId && cityId) provinceId = `${cityId.slice(0, 2)}0000`;
  return { provinceId, cityId };
}

async function main() {
  const rows = await prisma.place.findMany({
    where: {
      provinceId: null,
      OR: [
        { city: { not: null } },
        { province: { not: null } },
      ],
    },
    select: { id: true, province: true, city: true },
  });

  console.log(`Candidates (provinceId IS NULL with city/province text): ${rows.length}`);

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const { provinceId, cityId } = resolveAdcode(row.province, row.city);
    if (provinceId === null && cityId === null) {
      skipped += 1;
      continue;
    }
    const data = {};
    if (provinceId !== null) data.provinceId = provinceId;
    if (cityId !== null) data.cityId = cityId;
    await prisma.place.update({ where: { id: row.id }, data });
    updated += 1;
  }

  console.log(`Updated: ${updated}, Unresolved (left as-is): ${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
