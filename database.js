/* All functions related to db operations 
* will be here
*/

var mongo = require('mongoskin');
var conn = mongo.db('mongodb://localhost:27017/test');

//Get a list of all users
exports.getUsers = function(){
	c = conn.collection('users').find();
	c.each(function(err, item){
		console.log(item); // need to handle errors properly
	});
}

exports.insertUser = function(){
	c = conn.collecti;
};