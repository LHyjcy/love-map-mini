# miniprogram — love-map-mini

微信原生小程序（Phase 1 骨架）。

## 导入

用微信开发者工具「导入项目」，目录选择 `apps/miniprogram`。`project.config.json` 中
`appid` 暂为测试号 `touristappid`，正式开发请替换为自己的 AppID。

## 结构

```
apps/miniprogram/
├─ app.js / app.json / app.wxss
├─ project.config.json
├─ sitemap.json
└─ pages/
   ├─ home/   首页 dashboard
   ├─ map/    地图与回忆
   ├─ tasks/  任务与积分
   ├─ shop/   商城与背包
   ├─ events/ 日程与纪念日
   └─ me/     我的与隐私设置
```

## 约定

- API 基础地址在 `app.js` 的 `globalData.baseUrl`，默认 `http://localhost:3000`。
  正式环境需在微信后台配置 request / uploadFile 合法域名（https）。
- 地图统一使用微信内置 `map` 组件，小程序端**不使用 Leaflet**。
- Phase 1 仅页面骨架，无业务逻辑。
