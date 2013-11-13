var Entity        = require('../../engine/entity')
var GF            = require('../../engine/graphics-factory');
var userInterface = require('../../engine/user-interface');
var assets        = require('../../assets');

function TwLogo(id) {
  
  this.id = id;
  this.sprite = GF.uiSprite(assets.image('intro-tw'), userInterface.width, userInterface.height);

};

TwLogo.prototype = new Entity();

module.exports = TwLogo;
