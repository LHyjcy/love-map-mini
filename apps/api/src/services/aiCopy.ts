/**
 * AI 文案生成服务（差异化）。
 *
 * 提供一个轻量的 LLM 抽象 chat()，以及三个面向业务的生成函数：
 * 回忆文案、分享口播、回顾总结。
 *
 * 设计目标：在没有任何 AI Key 的开发环境下也能正常工作——
 * 当 process.env.AI_API_KEY 缺失或调用出错时，自动回落到
 * 确定性的中文温暖模板（source: 'template'）。
 *
 * 仅使用全局 fetch 与 Node 内置能力，不引入新依赖。
 * 绝不打印 API Key。
 */

const AI_API_KEY = process.env.AI_API_KEY;
const AI_API_BASE = process.env.AI_API_BASE ?? 'https://api.openai.com/v1';
const AI_MODEL = process.env.AI_MODEL ?? 'gpt-4o-mini';

/**
 * 调用底层 Chat Completions 接口。
 * - 无 AI_API_KEY：返回 null，调用方使用模板回落。
 * - 出现任何异常（网络 / 非 2xx / 解析失败）：返回 null，优雅降级。
 * 永远不记录 Key。
 */
async function chat(systemPrompt: string, userPrompt: string): Promise<string | null> {
  if (!AI_API_KEY) {
    return null;
  }

  try {
    const resp = await fetch(`${AI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
      }),
    });

    if (!resp.ok) {
      return null;
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      return null;
    }
    const trimmed = content.trim();
    return trimmed === '' ? null : trimmed;
  } catch {
    // 网络异常 / JSON 解析失败等：静默降级到模板。
    return null;
  }
}

/** 标签数组转为可读的中文短语，如 ["散步","咖啡"] → "散步、咖啡"。 */
function joinTags(tags: string[] | undefined): string {
  if (!tags || tags.length === 0) {
    return '';
  }
  return tags
    .map((t) => t.trim())
    .filter((t) => t !== '')
    .join('、');
}

const SYSTEM_PROMPT =
  '你是一个温暖、细腻的情侣回忆文案助手，为一对情侣记录共同的生活点滴。' +
  '语气亲密、真诚、口语化，使用简体中文，不夸张、不煽情过度，不使用表情符号。';

export interface MemoryCopyResult {
  title: string;
  story: string;
  source: 'ai' | 'template';
}

export interface ShareCaptionResult {
  caption: string;
  source: 'ai' | 'template';
}

export interface ReviewSummaryResult {
  summary: string;
  source: 'ai' | 'template';
}

/**
 * 生成回忆文案：返回标题 + 一两句温暖的小故事。
 */
export async function genMemoryCopy(input: {
  placeTitle?: string;
  tags?: string[];
  mood?: string;
  date?: string;
}): Promise<MemoryCopyResult> {
  const placeTitle = input.placeTitle?.trim() || '';
  const mood = input.mood?.trim() || '';
  const date = input.date?.trim() || '';
  const tagText = joinTags(input.tags);

  const userPrompt =
    '请为一段情侣回忆生成文案。' +
    `\n地点：${placeTitle || '（未提供）'}` +
    `\n日期：${date || '（未提供）'}` +
    `\n心情：${mood || '（未提供）'}` +
    `\n标签：${tagText || '（未提供）'}` +
    '\n请输出 JSON：{"title":"不超过15字的温暖标题","story":"1到2句温暖的回忆描述"}，只输出 JSON。';

  const aiText = await chat(SYSTEM_PROMPT, userPrompt);
  if (aiText) {
    const parsed = tryParseTitleStory(aiText);
    if (parsed) {
      return { title: parsed.title, story: parsed.story, source: 'ai' };
    }
    // 模型未按 JSON 返回时，整体作为故事正文使用。
    return {
      title: `在${placeTitle || '这里'}的一天`,
      story: aiText,
      source: 'ai',
    };
  }

  // 模板回落。
  const title = `在${placeTitle || '这里'}的一天`;
  const parts: string[] = [];
  if (date) {
    parts.push(`${date}`);
  }
  parts.push(`我们一起去了${placeTitle || '一个想去的地方'}`);
  if (mood) {
    parts.push(`那天的心情是${mood}`);
  }
  if (tagText) {
    parts.push(`关于${tagText}的小事都被悄悄记了下来`);
  }
  const story = `${parts.join('，')}。愿这一刻一直被我们记得。`;

  return { title, story, source: 'template' };
}

/** 尝试从模型输出中解析 {title, story}。失败返回 null。 */
function tryParseTitleStory(text: string): { title: string; story: string } | null {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }
    const obj = JSON.parse(text.slice(start, end + 1)) as {
      title?: unknown;
      story?: unknown;
    };
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    const story = typeof obj.story === 'string' ? obj.story.trim() : '';
    if (title === '' || story === '') {
      return null;
    }
    return { title, story };
  } catch {
    return null;
  }
}

/**
 * 生成分享口播文案：用于把地点 / 回忆分享给彼此或对外分享。
 */
export async function genShareCaption(input: {
  placeTitle?: string;
  tags?: string[];
  count?: number;
}): Promise<ShareCaptionResult> {
  const placeTitle = input.placeTitle?.trim() || '';
  const tagText = joinTags(input.tags);
  const count = typeof input.count === 'number' && input.count > 0 ? input.count : 0;

  const userPrompt =
    '请为情侣分享一条简短的配文（caption）。' +
    `\n地点：${placeTitle || '（未提供）'}` +
    `\n标签：${tagText || '（未提供）'}` +
    `\n本次包含的回忆/照片数：${count || '（未提供）'}` +
    '\n要求：一句话，温暖亲密，不超过30字，不使用表情符号，直接输出文案本身。';

  const aiText = await chat(SYSTEM_PROMPT, userPrompt);
  if (aiText) {
    return { caption: aiText, source: 'ai' };
  }

  // 模板回落。
  const where = placeTitle || '我们去过的地方';
  const segments: string[] = [`和你在${where}的时光`];
  if (count > 0) {
    segments.push(`一共留下了 ${count} 个瞬间`);
  }
  if (tagText) {
    segments.push(`关于${tagText}`);
  }
  const caption = `${segments.join('，')}，都想和你一起再走一遍。`;

  return { caption, source: 'template' };
}

/**
 * 生成回顾总结：月度 / 年度回顾的一段温暖小结。
 */
export async function genReviewSummary(input: {
  memoryCount: number;
  placeCount: number;
  cityCount: number;
  provinceCount: number;
  photoCount: number;
  topTags?: string[];
  period?: string;
}): Promise<ReviewSummaryResult> {
  const { memoryCount, placeCount, cityCount, provinceCount, photoCount } = input;
  const tagText = joinTags(input.topTags);
  const period = input.period?.trim() || '';

  const userPrompt =
    '请为一对情侣写一段温暖的回顾总结。' +
    `\n周期：${period || '这一段时间'}` +
    `\n回忆数：${memoryCount}` +
    `\n地点数：${placeCount}` +
    `\n城市数：${cityCount}` +
    `\n省份数：${provinceCount}` +
    `\n照片数：${photoCount}` +
    `\n高频标签：${tagText || '（未提供）'}` +
    '\n要求：2到3句，温暖真诚，自然融入这些数字，不使用表情符号，直接输出文案本身。';

  const aiText = await chat(SYSTEM_PROMPT, userPrompt);
  if (aiText) {
    return { summary: aiText, source: 'ai' };
  }

  // 模板回落。
  const periodLabel = period || '这一段时间';
  const parts: string[] = [];
  parts.push(`${periodLabel}里，我们一起去了 ${cityCount} 座城`);
  if (provinceCount > 0) {
    parts.push(`走过 ${provinceCount} 个省份`);
  }
  parts.push(`在 ${placeCount} 个地方留下了 ${memoryCount} 段回忆`);
  if (photoCount > 0) {
    parts.push(`拍下 ${photoCount} 张照片`);
  }
  let summary = `${parts.join('，')}。`;
  if (tagText) {
    summary += `这些日子大多和${tagText}有关，`;
  }
  summary += '愿下一段时光，依然有你在身边。';

  return { summary, source: 'template' };
}
