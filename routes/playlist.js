var express = require('express')
var router = express.Router()
var playlists = require('../models.js').playlists

function findAndReturn (id, res) {
  playlists.findOne({ _id: id }, function (err, doc) {
    if (doc && !err) {
      res.send(doc)
    } else {
      res.status(404).send('Not found')
    }
  })
}

router.get('/api/playlist/', function (req, res) {
  playlists.find({}, function (err, data) {
    if (err) {
      return res.status(400).send('Error')
    }
    return res.send(data)
  })
})

router.get('/api/playlist/:id/', function (req, res) {
  findAndReturn(req.params.id, res)
})

router.post('/api/playlist/', function (req, res) {
  var doc = {
    'name': req.body.name,
    'tracks': req.body.tracks || []
  }
  playlists.insert(doc, function (err, doc) {
    if (err) {
      return res.status(400).send('Error')
    }
    res.send(doc)
  })
})

router.post('/api/playlist/:id/', function (req, res) {
  playlists.findOne({ _id: req.params.id }, function (err, doc) {
    if (err) { return res.status(400).send('Error') }
    doc.name = req.body.name
    doc.tracks = req.body.tracks || []
    playlists.update({ _id: req.params.id }, { $set: doc }, function (err, numReplaced) {
      if (err) { return res.status(400).send('Error') }
      findAndReturn(req.params.id, res)
    })
  })
})

router.post('/api/playlist/:id/add/', function (req, res) {
  if (!req.body.track) { res.status(404).send('Not found') }
  playlists.update({ _id: req.params.id }, { $push: { tracks: req.body.track } }, function (err, numReplaced) {
    if (err) { return res.status(400).send('Error') }
    findAndReturn(req.params.id, res)
  })
})

module.exports = router
