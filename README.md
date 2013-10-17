## What's this ?

websql.js is a tiny library easing developpement with Websql databases.

work was based upon the massivejs library. massivejs is a nodejs module and provides an intuitive interface over raw Mysql and Postgre modules.

basically, websql.js intends to brings the same interface into websql supported browsers (webkit based). but actually it provides some enhancements, so instead of writing something like

```javascript
// callback style api
db.exec('select * from todos', [],
	/* success callback */
	function(result, transaction) {
		...
	},
	/* error callback */
	function(error, transaction) {
		...
	});
```
you write code like this

```javascript
// Promise style api
var cmd = db.exec('select * from todos', []);
cmd.done(function(result, transaction) {
		...
	});
cmd.fail(function(error, transaction) {
		...
	});	
```
the Promise style is best suited for asynchronous operations. it allows to chain together multiples async operations without ending up with deep nested code structures (callbacks inside another callbacks).


## Getting Started
Download the [production version][min] or the [development version][max].

[min]: https://raw.github.com/yelouafi/websql.js/master/dist/websql.min.js
[max]: https://raw.github.com/yelouafi/websql.js/master/dist/websql.js

websql.js promise api is based on the jquery implementation so you need to import the jquery library before

In your web page:

```html
<script src="{{your jquery import}}"></script>
<script src="websql.min.js"></script>
<script>

	var db = new websql.Db("db");
	var model = { 
		tables: { 
			todos: {
				task: { type: 'text', required: true, unique: true}, 
				duedate: 'date', 
				completed: 'boolean'
			}			
	};
	
	db.upgrade(model)
	.then(function(res, tx) {		
		return db.todos.insert({ task: "learn something", duedate: new Date(2013,11, 30), completed: true});			
	}).then(function(insertId, tx) {		
		console.log("Last insterted id : " + insertId); 
		return db.contacts.first(tx);
	})
	.done(function(todo, tx) {
		console.log("first thing to do : " + todo.task);
	})
	.done(function(res, tx) {
		console.log("can't be here");
	})
}

</script>
```

## Documentation
_(Coming soon)_

## Examples
_(Coming soon)_

## Release History
17 oct 2013 : version 0.1.0 (initial release)
