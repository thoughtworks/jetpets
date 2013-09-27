var routie = require('../../../3rdparty/routie');
var player = require('../player');
var _ = require('underscore');
var view = require('../../views/register-advanced.hbs');

module.exports = function() {
  
  if (player.get().id) {
    return routie.navigate('/wait');
  }
  
  $('#page').attr('class', 'register');
  $('#page').html(view());
  
  $('button').on('click', register);
  
};

function giveFeedback(data){
   _.each(data, function(field, key){
      if (field[2] === false){
        field[0].parent().addClass("error");
        field[0].parent().get(0).scrollIntoView()
      }
   });
}

function mapData(data){
  return _.map(data,function(control){
    if (control.val() === "" || control.val() === "Select Country" || control.val() === "Select Role" ){
        return [control, control.val(), false];
    } 
    return [control,control.val(), true];
  });
}

function validate(data){
  return _.every(data, function(field){
    return field[2];
  });
}

function register(e) {
  e.preventDefault();

  var data = {
    firstName:    $('#firstName'),
    lastName:     $('#lastName'),
    company:      $('#company'),
    country:      $('#country'),
    role:         $('#role'),
    email:        $('#email')
  };

  var mappedData = mapData(data);

  var dataIsValid = validate(mappedData);

  if (dataIsValid){
    var formData = _.map(mappedData, function(field){return field[1]});
    console.log("FIELDS", formData);
    
    $.ajax({
      type: 'POST',
      url: '/player',
      data: JSON.stringify(formData),
      dataType: 'json',
      contentType: 'application/json; charset=utf-8'
    }).then(go).fail(error);
  
  }
  else {
    giveFeedback(mappedData); 
  }
}

function go(data) {
  player.set({
    id: data.id,
    name: data.name
  });
  routie.navigate('/wait');
}

function error(res) {
  alert('Error: ' + res);
}
