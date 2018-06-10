var crypto = require('crypto')
var http = require('http')
var request = require('request')
var express = require('express')
var bodyParser = require('body-parser')
var playlistRoutes = require('./routes/playlist.js')
var lyricSearch = require('./lyric_search')
var playlists = require('./models.js').playlists

const hasher = function hasher (a) {
  return crypto.createHmac('sha256', 'nosecret').update(a).digest('hex')
}

var app = express()
app.set('port', 9000)
// app.use(express.static('web'));
app.use(express.static('static_html'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

const YoutubePlayer = (function () {
  var that = this
  this.initialized = true
  this.currentTrack = null
  this.timePlayed = 0
  this.trackLength = 0
  this.playLoopId = null
  this.tracksQueue = null
  this.paused = false

  this.isPlaying = function () {
    // if the current track is not null we are playing it
    return this.currentTrack != null
  }

  this.checkAndPlay = function () {
    if (!this.isPlaying() && this.initialized) {
      var videoId = this.tracksQueue.getNextTrackInQueue()
      if (videoId != null) {
        io.emit('player.start.videoId', {
          videoId: videoId,
          queueIndex: TracksQueue.queueIndex,
          timePlayed: 0
        })
        this.playVideo(videoId)
      }
    }
  }

  this.startPlayLoop = function () {
    this.playLoopId = setInterval(function () {
      that.checkAndPlay()
      that.syncTimePlayer()
    }, 911)
  }

  this.isPaused = function () {
    return that.paused
  }

  this.pause = function () {
    that.paused = true
    io.emit('player.pause')
  }

  this.resume = function () {
    io.emit('player.resume')
  }

  this.skip = function () {
    // jump to a different song on the queue
    console.log('Skip current track')
    that.currentTrack = null
    this.timePlayed = 0
  }

  this._syncTimePlayer = function () {
    io.emit('player.time', {
      currentTrack: that.currentTrack,
      timePlayed: that.timePlayed,
      trackLength: that.trackLength,
      isPaused: that.isPaused()
    })
  }

  this.syncTimePlayer = this._syncTimePlayer

  this.playVideo = function (videoId) {
    if (!this.initialized) { console.log('not ready to play') };
    if (this.currentTrack === videoId) return null
    console.log('PlayeVideo %s %s', videoId, YoutubePlayer.tracksQueue.videosDetails[videoId].title)
    this.currentTrack = videoId
    io.emit('player.play', {
      videoId: this.currentTrack
    })
  }

  return this
})()

const TracksQueue = (function () {
  // lists of ids
  this.tracks = []
  // dict of videoId -> {title: ''}
  this.videosDetails = {}
  // trackUris index
  this.queueIndex = -1

  this.shuffle = function () {

  }

  this.swap = function (source, dest) {
    if (this.tracks[source] && this.tracks[dest]) {
      var tmp = this.tracks[source]
      this.tracks[source] = this.tracks[dest]
      this.tracks[dest] = tmp
      io.emit('queue.swap', {
        dest: this.tracks[source],
        source: this.tracks[dest]
      })
    }
  }

  this.pushTrackAfterCurrent = function (videoId) {
    if (this.tracks.indexOf(videoId) !== -1) {
      io.emit('queue.alreadyInQueue', { videoId: videoId })
      return
    }
    this.tracks.splice(this.queueIndex + 1, 0, videoId)
  }

  this.replaceQueue = function (videoIdList) {
    this.tracks = []
    for (var i = 0; i < videoIdList.length; i++) {
      var t = videoIdList[i]
      if (this.tracks.indexOf(t) === -1) {
        this.tracks.push(t)
      }
    }
    this.queueIndex = -1
    io.emit('queue.replaced')
  }

  this.pushTrack = function (videoId, title) {
    if (this.tracks.indexOf(videoId) !== -1) {
      io.emit('queue.alreadyInQueue', { videoId: videoId })
      return
    }
    this.videosDetails[videoId] = {
      'title': title
    }
    this.tracks.push(videoId)
    io.emit('queue.added', { videoId: videoId })
  }

  this.removeTrack = function (videoId) {
    var index = this.tracks.indexOf(videoId)
    if (index > -1) {
      this.tracks.splice(index, 1)
      if (index < this.queueIndex) {
        // when removing from the queue go back one if removed from behind the current track
        this.queueIndex -= 1
      }
      io.emit('queue.removed', { videoId: videoId })
    }
  }

  this.getQueue = function () {
    return this.tracks.map(videoId => {
      return {
        'videoId': videoId,
        'title': this.videosDetails[videoId].title
      }
    })
  }
  this.moveQueueIndexTo = function (indexNumber) {
    while (indexNumber < 0) {
      indexNumber += this.tracks.length
    }
    this.queueIndex = (indexNumber) % this.tracks.length
    if (isNaN(this.queueIndex)) {
      this.queueIndex = 0
    }
  }
  this.moveQueueIndexToPrevious = function () {
    this.moveQueueIndexTo(this.queueIndex - 1)
  }
  this.moveQueueIndexToNext = function () {
    this.moveQueueIndexTo(this.queueIndex + 1)
  }

  this.getCurrentTrack = function () {
    if (this.tracks.length === 0) return null
    return this.tracks[this.queueIndex]
  }

  this.getNextTrackInQueue = function () {
    if (this.tracks.length == 0) return null
    this.moveQueueIndexToNext()
    console.log('switch queue to next track')
    return this.getCurrentTrack()
  }

  return this
})()

YoutubePlayer.tracksQueue = TracksQueue
YoutubePlayer.startPlayLoop()

// youtube search api
var {google} = require('googleapis')
var privatekey = require('./google-client-secrets.json')

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
    console.log('Successfully connected!')
  }
})
// global authorization
google.options({
  auth: jwtClient
})

var youtubeService = google.youtube('v3')

function getDetailsForVideo (videoId) {
  let data = videoResultsCache[videoId]
  if (!data) {
    return {}
  }
  return {
    title: data.snippet.title,
    thumbnail: data.snippet.thumbnails.high.url
  }
}

var videoResultsCache = {} // key is the videoid
var searchVideosCache = {} // key is the search term
function searchVideos (query, callback) {
  // this function will search on youtube for video matching the query
  var hash = hasher(query)
  if (searchVideosCache[hash]) {
    console.log('using cache')
    return callback(searchVideosCache[hash])
  }

  var parameters = {
    'maxResults': '25',
    'part': 'snippet',
    'q': query,
    'type': 'video'
  }
  youtubeService.search.list(parameters, function (err, response) {
    if (err) { console.log('The API returned an error: ' + err); return }
    searchVideosCache[hash] = response.data.items
    for (let index = 0; index < response.data.items.length; index++) {
      const item = response.data.items[index]
      videoResultsCache[item.id.videoId] = item
    }
    callback(response.data.items)
  })
}

app.use(playlistRoutes)

app.get('/api/track/', function (req, res) {
  res.send({
    videoId: YoutubePlayer.currentTrack,
    details: getDetailsForVideo(YoutubePlayer.currentTrack),
    queueIndex: TracksQueue.queueIndex,
    timePlayed: YoutubePlayer.timePlayed,
    isPaused: YoutubePlayer.isPaused()
  })
})

app.get('/api/queue/', function (req, res) {
  res.send(TracksQueue.getQueue())
})

app.post('/api/queue/', function (req, res) {
  TracksQueue.pushTrack(
    req.body.videoId,
    req.body.title
  )
  res.send('OK')
})

app.post('/api/queue/swap/', function (req, res) {
  TracksQueue.swap(
    parseInt(req.body.source),
    parseInt(req.body.dest)
  )
  res.send('OK')
})

app.post('/api/queue/changeto/', function (req, res) {
  // 0 padded position
  TracksQueue.queueIndex = parseInt(req.body.position)
  YoutubePlayer.playVideo(TracksQueue.getCurrentTrack())
  res.send('OK')
})

app.post('/api/unqueue/', function (req, res) {
  var videoId = req.body.videoId
  TracksQueue.removeTrack(videoId)
  res.send('OK')
})

app.post('/api/pause/', function (req, res) {
  YoutubePlayer.pause()
  res.send('OK')
})

app.post('/api/prev/', function (req, res) {
  TracksQueue.moveQueueIndexToPrevious()
  YoutubePlayer.playVideo(TracksQueue.getCurrentTrack())
  res.send('OK')
})

app.post('/api/next/', function (req, res) {
  YoutubePlayer.moveQueueIndexToNext()
  YoutubePlayer.playVideo(TracksQueue.getCurrentTrack())
  res.send('OK')
})

app.post('/api/resume/', function (req, res) {
  YoutubePlayer.resume()
  res.send('OK')
})

app.get('/api/suggestion/wikipedia/', function (req, res) {
  var q = req.query.search
  request({
    url: 'https://en.wikipedia.org/w/api.php',
    qs: {
      action: 'opensearch',
      limit: '10',
      namespace: 0,
      format: 'json',
      search: q
    }
  }, function (error, response, body) {
    if (error) {
      res.status(404).send('Not found')      
    }
    try {
      res.send(JSON.parse(body)[1])
    } catch (e) {
      console.log(e)
      res.status(404).send('Not found')
    }
  })
})

app.get('/api/suggestion/', function (req, res) {
  var q = req.query.search
  request({
    url: 'http://www.last.fm/es/search?q=' + q,
    // url: "https://www.musixmatch.com/ws/1.1/macro.search",
    strictSSL: false
  }, function (error, response, body) {
    if (error) { return res.status(404).send('Not found') }
    var re = /href="\/.+music\/([\w\d\+]+)\/.*/gi
    var match = re.exec(body)
    var result = []
    while (match != null) {
      var artist = match[1].split('+').join(' ')
      if (result.indexOf(artist) == -1) {
        result.push(artist)
      }
      match = re.exec(body)
    }
    res.send(result)
  })
})

app.get('/api/suggestion/musix/', function (req, res) {
  var q = req.query.search
  request({
    url: 'https://www.musixmatch.com/ws/1.1/macro.search?app_id=community-app-v1.0&format=json&part=artist_image&page_size=10&q=' + q,
    // url: "https://www.musixmatch.com/ws/1.1/macro.search",
    strictSSL: false
  }, function (error, response, body) {
    if (error) {
      res.status(404).send('Not found')      
    }
    try {
      var r = JSON.parse(body).message.body.macro_result_list.artist_list.reduce(function (a, d) {
        if (d.artist.artist_name < 65 || d.artist.artist_rating > 0) {
          a.push(d.artist.artist_name)
        }
        return a
      }, [])
      res.send(r)
    } catch (e) {
      console.log(e)
      res.status(404).send('Not found')
    }
  })
})

app.get('/api/search/', function (req, res) {
  var q = req.query.q
  searchVideos(q, function (items) {
    res.send(items)
  })
})

app.post('/api/playlist/:id/play/', function (req, res) {
  playlists.findOne({ _id: req.params.id }, function (err, doc) {
    if (err) {
      res.status(404).send('Not found')      
    }
    if (doc) {
      TracksQueue.replaceQueue(doc.tracks)
      res.send('OK')
    } else {
      res.status(404).send('Not found')
    }
  })
})

var server = http.createServer(app)
var io = require('socket.io')()
io.attach(server)

// not reciving event yet
io.on('connection', function (socket) {
  socket.on('musicServer.update', function (data) {
    YoutubePlayer.trackLength = data.trackLength
    YoutubePlayer.timePlayed = data.timePlayed
    YoutubePlayer.paused = data.isPaused
  })
})

server.listen(app.get('port'), function () {
  console.log('Express server listening on port ' + app.get('port'))
})
