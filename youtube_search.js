// video details cache
var db = require('./models.js')
var crypto = require('crypto')
// youtube search api
var {google} = require('googleapis')
var privatekey = require('./google-client-secrets.json')

const hasher = function hasher (a) {
  return crypto.createHmac('sha256', 'nosecret').update(a).digest('hex')
}

// configure a JWT auth client
let jwtClient = new google.auth.JWT(
  privatekey.client_email,
  null,
  privatekey.private_key,
  ['https://www.googleapis.com/auth/youtube.readonly']
)
// authenticate request
jwtClient.authorize(function (err, tokens) {
  if (err) {
    console.log(err)
  } else {
    console.log('Successfully connected google JWT client!')
  }
})
// global authorization
google.options({ auth: jwtClient })

var youtubeService = google.youtube('v3')

function getDetailsForVideo (videoId) {
  return new Promise(resolve => {
    db.videoDetails.findOne({'_id': videoId}, (err, doc) => {
      if (err || !doc) {
        resolve({})
      } else {
        resolve({
          title: doc.item.snippet.title,
          thumbnail: doc.item.snippet.thumbnails.high.url
        })
      }
    })
  })
}

var searchVideosCache = {} // key is the search term
function searchVideos (query) {
  return new Promise((resolve, reject) => {
    // this function will search on youtube for video matching the query
    var hash = hasher(query)
    if (searchVideosCache[hash]) {
      console.log('using cached results')
      return resolve(searchVideosCache[hash])
    }

    var parameters = {
      'maxResults': '30',
      'part': 'snippet',
      'q': query,
      'type': 'video'
    }

    youtubeService.search.list(parameters, function (err, response) {
      if (err) {
        console.log('The API returned an error: ' + err)
        return resolve([])
      }
      searchVideosCache[hash] = response.data.items
      for (let index = 0; index < response.data.items.length; index++) {
        const item = response.data.items[index]
        db.videoDetails.insert({
          '_id': item.id.videoId,
          'item': item
        })
      }
      resolve(response.data.items)
    })
  })
}

exports.getDetailsForVideo = getDetailsForVideo
exports.videos = searchVideos
