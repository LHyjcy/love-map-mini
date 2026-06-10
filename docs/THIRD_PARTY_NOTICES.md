# Third-Party Notices — love-map-mini

本项目为**原创实现**，在产品功能与架构思路上参考了以下开源项目，但**未复制**其源代码、
UI 素材、图片、品牌或文案，也未使用其任何密钥。

## 参考项目

### mappedlove

- 仓库：https://github.com/Yizack/mappedlove
- 借鉴范围（仅思路）：情侣 bond、情侣记忆地图、地点标记、回忆故事、照片记忆、公开地图分享。
- 未使用：其源代码、页面设计、图片素材、品牌、商业支付逻辑。

### qinglv (Leng-bingo/qinglv)

- 仓库：https://github.com/Leng-bingo/qinglv
- 借鉴范围（仅思路）：微信小程序结构、Node + MySQL 组织方式、情侣绑定、任务、积分、
  商城、日程、签到、位置打卡。
- 未使用：其网络图片素材、作者文案、明文密钥写法、未加固的权限逻辑。

### map-of-us-template (zkeyoned/map-of-us-template)

- 仓库：https://github.com/zkeyoned/map-of-us-template
- 借鉴范围（仅思路）：足迹地图「省份/城市点亮」的产品形态、全国→省→市→回忆的层级下钻、年度回顾/海报的仪式感。
- 未使用：其源代码、d3-geo/SVG 实现、本地 GeoJSON/省市静态数据、图片、品牌与文案。
  本项目的足迹地图为自实现（小程序 canvas 投影 + 多边形点亮 + 射线法命中），数据另取自公开来源（见下）。

## 数据来源

### 中国行政区划 GeoJSON（DataV GeoAtlas）

- 来源：阿里 DataV GeoAtlas（https://geo.datav.aliyun.com/areas_v3/bound/ ）公开行政区划边界数据。
- 用途：足迹地图省/市边界渲染与点亮。文件存于 `apps/api/assets/geo/`，由后端 `/api/geo/*` 下发；
  缺失省份在线按需拉取并缓存。
- 说明：仅使用其公开边界几何数据用于展示；如其许可条款有要求，使用时遵循之。未复制参考小程序/模板项目自带的任何数据文件。

## 说明

- 本项目所有 UI 资源为自建占位素材或简单本地图标。
- 若后续引入开源依赖，其许可证信息将补充到本文件。
- 如参考项目附带特定开源许可证，相应 notice 在使用其受版权保护内容时保留——本项目
  目前未使用此类内容。
