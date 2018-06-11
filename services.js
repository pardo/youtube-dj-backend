var request = require('request')

function searchLastFm (query) {
  return new Promise((resolve, reject) => {
    request({
      url: 'http://www.last.fm/es/search',
      qs: {
        q: query
      },
      strictSSL: false
    }, function (error, response, body) {
      var results = []
      if (error) { resolve(results) }
      var albumsRegex = /href="\/.+music\/([\w\d\+]+)\/([\w\d\+]+).*/gi
      var match = albumsRegex.exec(body)
      var artist = ''
      var album = ''
      // iterate over the document finding matchs
      while (match != null) {
        artist = match[1].split('+').join(' ').trim()
        album = match[2].split('+').join(' ').trim()
        if (album !== '_') {
          album = artist + ' - ' + album
          if (!results.includes(album)) {
            results.push(album)
          }
        } else if (!results.includes(artist)) {
          results.push(artist)
        }
        match = albumsRegex.exec(body)
      }
      resolve(results)
    })
  })
}

function searchWikipedia (query) {
  return new Promise((resolve, reject) => {
    request({
      url: 'https://en.wikipedia.org/w/api.php',
      qs: {
        action: 'opensearch',
        limit: '10',
        namespace: 0,
        format: 'json',
        search: query
      }
    }, function (error, response, body) {
      if (error) {
        reject({})
      } else {
        try {
          resolve((JSON.parse(body)[1]))
        } catch (e) {
          reject({})
        }
      }
    })
  })
}

exports.searchLastFm = searchLastFm
exports.searchWikipedia = searchWikipedia
