var Datastore = require('nedb')
var playlists = new Datastore({
  filename: 'playlists.nedb',
  autoload: true
})
var queue = new Datastore({
  filename: 'queue.nedb',
  autoload: true
})
var videoDetails = new Datastore({
  filename: 'videoDetails.nedb',
  autoload: true
})
/*
{
  id: "id",
  name: "playlist name",
  tracks: ["spotify:uri", "spotify:uri"]
}
*/
module.exports = {
  playlists: playlists,
  queue: queue,
  videoDetails: videoDetails
}
