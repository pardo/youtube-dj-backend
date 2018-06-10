var Datastore = require('nedb')
var playlists = new Datastore({ filename: 'playlists.nedb', autoload: true });
/*
{
  id: "id",
  name: "playlist name",
  tracks: ["spotify:uri", "spotify:uri"]
}
*/
module.exports.playlists = playlists
