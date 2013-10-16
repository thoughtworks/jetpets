var routie = require('../../../3rdparty/routie');
var player = require('../player');
var _ = require('underscore');
var view = require('../../views/register-simple.hbs');

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
      field[0].parent().removeClass("error");
      if (field[2] === false){
        field[0].parent().addClass("error");
        field[0].parent().get(0).scrollIntoView()
      }
   });
}

function mapData(data){
  return _.inject(data, function(memo, control, key){
    var isInvalid = (control.val() === "" || control.val() === "Select Country" || control.val() === "Select Role" );
    memo[key] = [control, control.val(), !isInvalid];
    return memo;
  }, {});
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
    var formData = _.inject(mappedData, function(m, field, key){ m[key] = field[1]; return m; }, {});
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
