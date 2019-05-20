var request = require('request');
var fs = require('fs');
var path = require('path');
var config = require('./config');

var utils = {
  noop: function () {
  },
  tplEngine: function (temp, data, regexp) {
    if (!(Object.prototype.toString.call(data) === '[object Array]')) data = [data];
    var ret = [];
    for (var i = 0, j = data.length; i < j; i++) {
      ret.push(replaceAction(data[i]));
    }
    return ret.join('');

    function replaceAction(object) {
      return temp.replace(regexp || (/{([^}]+)}/g), function (match, name) {
        if (match.charAt(0) == '\\') return match.slice(1);
        return (object[name] != undefined) ? object[name] : '{' + name + '}';
      });
    }
  },
  forEach: function (obj, callback) {
    callback = callback || utils.noop;
    var loopObj = function () {
      for (var key in obj) {
        callback(obj[key], key, obj);
      }
    };
    var loopArr = function () {
      for (var i = 0, len = obj.length; i < len; i++) {
        callback(obj[i], i);
      }
    };
    if (utils.isObj(obj)) {
      loopObj();
    }
    if (utils.isArray(obj)) {
      loopArr();
    }
  },
  isObj: function (obj) {
    return (Object.prototype.toString.call(obj) == '[object Object]');
  },
  isArray: function (arr) {
    return (Object.prototype.toString.call(arr) == '[object Array]');
  },
  extend: function (target, source) {
    for (var key in source) {
      target[key] = source[key];
    }
  }
};
var post = function (url, option) {
  var body = option.body || "";
  var success = option.success || utils.noop;
  var error = option.error || utils.noop;
  var _headers = option.headers || {};
  var headers = {
    // 必须携带 Agent
    "User-Agent": "PostmanRuntime/6.1.6",
    Cookie: config.cookie,
    "Content-Type": "text/plain;charset=utf-8"
  };
  utils.extend(headers, _headers);
  request.post({
    url: url,
    headers: headers,
    body: body,
    timeout: 120000
  }, function (e, resp, body) {
    if (e) {
      return error(e);
    }
    success(body);
  });
};
var get = function (url, option) {
  var success = option.success || utils.noop;
  var error = option.error || utils.noop;
  request.get({
    url: url,
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    timeout: 120000
  }, function (e, resp, body) {
    if (e) {
      return error(e);
    }
    success(body);
  });
};

// 接收 DWR 回调
var dwr = {
  engine: {
    _remoteHandleCallback: function (id, count, data) {
      return data;
    }
  }
};
var convertData = function (data) {
  var index = data.indexOf("[{");
  data = data.substr(index, data.length - 1);
  return eval(data);
};

var getAlbums = function (name, success, error) {
  var body = ["callCount=1",
    "scriptSessionId=${scriptSessionId}187",
    "c0-scriptName=UserSpaceBean",
    "c0-methodName=getUserSpace",
    "c0-id=0",
    "c0-param0=string:" + encodeURIComponent(name),
    "batchId=534505"].join("\n");
  var tpl = "http://photo.163.com/photo/{name}/dwr/call/plaincall/UserSpaceBean.getUserSpace.dwr?u={name}"
  var url = utils.tplEngine(tpl, {
    name: name
  });
  post(url, {
    body: body,
    headers: {
      "Content-Type": "application/javascript;charset=utf-8"
    },
    success: function (body) {
      var res = eval(body);
      var url = res.cacheFileUrl;
      var tpl = "http://{url}";
      url = utils.tplEngine(tpl, {
        url: url
      });
      get(url, {
        success: function (albums) {
          albums = convertData(albums);
          success(albums);
        }
      });
    },
    error: error
  });
};

var getPhotos = function (username, album, success, error) {
  var id = album.id;
  var albumName = album.name;
  var tpl = "http://photo.163.com/photo/{username}/dwr/call/plaincall/AlbumBean.getAlbumData.dwr?u={username}"
  url = utils.tplEngine(tpl, {
    username: username
  });
  var body = ["callCount=1",
    "scriptSessionId=${scriptSessionId}187",
    "c0-scriptName=AlbumBean",
    "c0-methodName=getAlbumData",
    "c0-id=0",
    "c0-param0=string:" + id,
    "c0-param1=string:",
    "c0-param2=string:",
    "c0-param3=number:" + Date.now(),
    "c0-param4=boolean:false",
    "batchId=777305"].join("\n");

  post(url, {
    body: body,
    success: function (body) {
      var url = null;
      try {
        url = eval(body);
      } catch (e) {
        console.log('获取相册图片 URL 失败: ', JSON.stringify(album), e)
      }
      if (!url) {
        console.log("获取相册图片 URL 失败: ", JSON.stringify(album));
        success([])
        return console.log(body);
      }
      var tpl = "http://{url}";
      url = utils.tplEngine(tpl, {
        url: url
      });
      var getUrl = function (photo) {
        var murl = photo.murl;
        var parts = murl.split("/");
        var num = parts.shift();
        var url = parts.join("/");
        if (url.includes("photo/")) {
          tpl = "http://img{num}.bimg.126.net/{url}"
        } else {
          tpl = "http://img{num}.ph.126.net/{url}"
        }
        url = utils.tplEngine(tpl, {
          num: num,
          url: url
        });
        return url;
      };

      get(url, {
        success: function (photos) {
          photos = convertData(photos);
          photos = photos.map(function (photo) {
            var url = getUrl(photo);
            var name = safeFileName(photo.desc);
            return {
              name: name,
              url: url,
              albumName: albumName
            };
          });
          success(photos);
        }
      });
    },
    error: error
  });
};

function safeFileName(name) {
  var MAX_FILE_NAME_LENGTH = 20;
  var result = encodeURI(name).replace("/", "");
  return result.length > MAX_FILE_NAME_LENGTH ? result.substr(0, MAX_FILE_NAME_LENGTH) : result;
}

function mkdir(name) {
  var dir = path.join(path.resolve(process.cwd(), config.output), name);
  if (!fs.existsSync(dir)) {
    return fs.mkdirSync(dir);
  }
  return true;
}

/*
  data 数据格式：
  var data = [{ name: '123', url: 'http://phpto.163.com/test.jpg', albumName: '' }]
*/
var data = [];
var summary = {
  albums: 0,
  photos: 0
};
var username = config.name;
console.log("开始抓取相册和图片信息……");
getAlbums(username, function (albums) {
  var index = 0;
  var total = albums.length;
  summary.albums = total;
  var getUrl = function () {
    if (index >= total) {
      console.log("相册信息抓取完成，相册: " + summary.albums + " 个，图片共: " + summary.photos + " 张");
      return startDownload();
    }
    var album = albums[index];
    var name = safeFileName(album.name);
    mkdir(name);
    getPhotos(username, album, function (photos) {
      summary.photos += photos.length;
      data = data.concat(photos);
      getUrl();
    }, function (error) {
      console.log(error);
    });
    index++;
  };
  getUrl();
});

function download(photo, callback) {
  var name = photo.name;
  var albumName = photo.albumName;
  var url = photo.url;
  var tpl = "{output}{albumName}/{name}.jpg"
  var output = config.output;
  name = utils.tplEngine(tpl, {
    albumName: safeFileName(albumName),
    name: safeFileName(name),
    output: output
  });
  var writeStream;
  try {
    writeStream = fs.createWriteStream(name);
    var readStream = request(url);
    readStream.pipe(writeStream);
    writeStream.on("finish", function () {
      writeStream.end();
      writeStream = null;
      callback();
    });
  } catch (e) {
    console.log('下载图片失败：', JSON.stringify(photo), e);
    writeStream && writeStream.end();
  }
}

function startDownload() {
  console.log("开始下载");
  var index = 0;
  var total = data.length;
  var process = function () {
    if (index >= total) {
      return console.log("下载完成");
    }
    var photo = data[index];
    index++;
    download(photo, function () {
      console.log("正在下载(" + index + "/" + total + ")");
      process();
    });
  };
  process();
}
