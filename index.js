var http = require('http')
var express = require('express')
var bodyParser = require('body-parser')
// var playlistRoutes = require('./routes/playlist.js')
var services = require('./services')
var youtubeSearch = require('./youtube_search')
var db = require('./models.js')

var app = express()
app.set('port', 9000)
// app.use(express.static('web'));
app.use(express.static('youtube-dj/dist'))
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
    console.log('PlayeVideo %s', videoId)
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
  // trackUris index
  this.queueIndex = -1

  this.shuffle = function () {

  }

  this.saveTracks = function () {
    db.queue.update(
      {'_id': 'singleton'},
      {'queue': this.tracks},
      {},
      (err, count) => {
        if (err) {
          console.log('Error saving tracks')
        } else {
          console.log('Saving tracks %s', count)
        }
      }
    )
  }

  this.loadTracks = function () {
    db.queue.findOne({}, (err, doc) => {
      if (err) { console.log('Unable to load tracks') }
      if (!doc) {
        console.log('Create track store')
        // create the initial doc
        db.queue.insert({
          '_id': 'singleton',
          'queue': []
        })
      } else {
        console.log('Loaded tracks doc %s', doc.queue.length)
        this.tracks = doc.queue
      }
    })
  }

  this.swap = function (source, dest) {
    if (this.tracks[source] && this.tracks[dest]) {
      var tmp = this.tracks[source]
      this.tracks[source] = this.tracks[dest]
      this.tracks[dest] = tmp
      this.saveTracks()
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
    io.emit('queue.added', { videoId: videoId })
    this.saveTracks()
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
    this.saveTracks()
  }

  this.pushTrack = function (videoId) {
    if (this.tracks.indexOf(videoId) !== -1) {
      io.emit('queue.alreadyInQueue', { videoId: videoId })
      return
    }
    this.tracks.push(videoId)
    io.emit('queue.added', { videoId: videoId })
    this.saveTracks()
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
      this.saveTracks()
    }
  }

  this.getQueue = async function () {
    return Promise.all(
      this.tracks.map(async function (videoId) {
        return youtubeSearch.getDetailsForVideo(videoId).then(details => {
          return {
            'videoId': videoId,
            'title': details.title
          }
        })
      })
    )
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
    if (this.tracks.length === 0) return null
    this.moveQueueIndexToNext()
    console.log('switch queue to next track')
    return this.getCurrentTrack()
  }

  return this
})()

YoutubePlayer.tracksQueue = TracksQueue
YoutubePlayer.tracksQueue.loadTracks()
YoutubePlayer.startPlayLoop()

// app.use(playlistRoutes)
app.get('/api/track/', async function (req, res) {
  var response = {
    videoId: YoutubePlayer.currentTrack,
    details: await youtubeSearch.getDetailsForVideo(YoutubePlayer.currentTrack),
    queueIndex: TracksQueue.queueIndex,
    timePlayed: YoutubePlayer.timePlayed,
    isPaused: YoutubePlayer.isPaused()
  }
  res.send(response)
})

app.get('/api/queue/', function (req, res) {
  TracksQueue.getQueue().then(queue => res.send(queue))
})

app.get('/api/server/', function (req, res) {
  res.send(serverSet)
})

app.post('/api/queue/next/', function (req, res) {
  TracksQueue.pushTrackAfterCurrent(
    req.body.videoId
  )
  res.send('OK')
})

app.post('/api/queue/', function (req, res) {
  TracksQueue.pushTrack(
    req.body.videoId
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

app.post('/api/queue/clear/', function (req, res) {
  TracksQueue.replaceQueue([])
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

app.post('/api/seek-to/', function (req, res) {
  io.emit('player.seek-to', {
    position: req.body.position
  })
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
  services.searchWikipedia(q).then((r) => {
    res.send(r)
  }, (e) => {
    res.status(404).send('Not found')
  })
})

app.get('/api/suggestion/', function (req, res) {
  var q = req.query.search
  services.searchLastFm(q).then((r) => {
    res.send(r)
  }, (r) => {
    res.send(r)
  })
})

app.get('/api/search/', function (req, res) {
  var q = req.query.q
  youtubeSearch.videos(q).then(function (items) {
    res.send(items)
  })
})

/*
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
*/

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/youtube-dj/dist/index.html')
})

var server = http.createServer(app)
var io = require('socket.io')()
io.attach(server)

var serverSet = null
// not reciving event yet
io.on('connection', function (socket) {
  socket.on('musicServer.update', function (data) {
    if (serverSet !== null && serverSet !== this.id) {
      return console.log('Server is playing can\'t be the server')
    }
    serverSet = this.id
    io.emit('server.set', serverSet)
    YoutubePlayer.trackLength = data.trackLength
    YoutubePlayer.timePlayed = data.timePlayed
    YoutubePlayer.paused = data.isPaused
  })
  socket.on('disconnect', function (data) {
    if (serverSet === this.id) {
      serverSet = null
      io.emit('server.set', null)
    }
  })
})

server.listen(app.get('port'), function () {
  console.log('Express server listening on port ' + app.get('port'))
})
