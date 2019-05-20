module.exports = {
  // 网易相册用户名称 username@163.com 取 username
  name: 'username',
  // 需手动在浏览器请求中抓去 Cookie，登录后刷新，看主 http://photo.163.com/${username} 请求的 request.header.cookie
  cookie: 'USERTRACK=111.179; usertrack=ezq0J1zi XXXX',
  // 下载路径
  output: './163albums/'
};
