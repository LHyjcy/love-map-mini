// utils/image.js — 图片缩略图工具（CommonJS）。
// disk 存储模式下原图地址形如 <base>/files/<objectKey>，后端另提供
// <base>/thumbs/<objectKey> 返回 640px 缩略图（缺图自动回退原图）。
// 列表/卡片用缩略图省流量提速；详情大图与 wx.previewImage 仍用原图。
// 非 disk 链接（COS/OSS 域名等，不含 /files/）原样返回，天然兼容。

function thumbUrl(url) {
  if (typeof url !== 'string' || url.indexOf('/files/') === -1) return url
  return url.replace('/files/', '/thumbs/')
}

module.exports = { thumbUrl }
