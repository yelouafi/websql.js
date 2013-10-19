## What's this ?

websql.js is a tiny library easing developpement with Websql databases.

work was based upon the [massive-js][massive] library. massivejs is a nodejs module and provides an intuitive interface over raw Mysql and Postgre modules.

[massive]: https://github.com/robconery/massive-js

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


## Basic usage
Download the [minified version][min] or the [development version][max].

[min]: https://raw.github.com/yelouafi/websql.js/master/dist/websql.min.js
[max]: https://raw.github.com/yelouafi/websql.js/master/dist/websql.js

websql.js promise api is based on the jquery implementation so you need to import the jquery library before

In your web page:

```html
<script src="{{your jquery import}}"></script>
<script src="websql.min.js"></script>

<script>
	// code will go here
</script>
```
first we create a database instance

```javascript
var db = new websql.Db("db");
```
to execute some query there is a basic exec method

```javascript
db.exec('create table if not exists todos (num integer primary key, task text, duedate text)')
	.done(function() {
		alert('table todos successfully created');
	})
	.fail(function(err) {
		alert('oops! something got wrong : ' + err.message);
	})
```

As said, the exec method doesn't take any callback. Instead it returns a [Deferred][deferred] object. We can register callbacks on it using the standard [done][done] and [fail][fail] methods.
[deferred]: http://api.jquery.com/category/deferred-object/
[done]: http://api.jquery.com/deferred.done/
[fail]: http://api.jquery.com/deferred.fail/

we can also chain function calls using the [then][then] method.
[then]: http://api.jquery.com/deferred.then/

```javascript
db.exec('create table if not exists todos (id integer primary key  autoincrement, task text, duedate text)')
	.then(function() {
		return db.exec('insert into todos (task, duedate) values (?, ?)', ["task-1", new Date(2013,11, 31)])
	})
	.done(function(todoId) {
		alert('remeber your newly created id : ' + todoId);
	})
```

note the use of return statement inside then method. since exec return a promise, we can run multiples 'then' operations in sequence. the next operation will take its paramters from the previous operation ( db.exec('insert ...') passed the new inserted id to the done function argument )
and stop the call chain as soon as one operation fail. 

```javascript
db.exec('create table if not exists todos (id integer primary key autoincrement, task text, duedate text)')
	.then(function() {
		return db.exec('insert into todos (task, duedate) values (?, ?)', ["task-1", new Date(2013,11, 31)]);
	})
	.then(function() {
		return db.query('select * from todos');
	})
	.done(function(todoList) {
		for(var i=0; i<todoList.length; i++) {
			var todo = todoList[i];
			alert("task " + todo.task + " to be done before " + todo.duedate);
			// do something with todo
		}
	})
```

in the code above each exec operation is passed a parameter which is nothing but the value returned from the previous operation.

note in the db.exec("insert ...", ...) how we passed an array of values to be used as parameters for the insert sql statement. this is the same as the raw websql execute method. but actually db.exec do some extra processing, for example we passed a date parameter but SQlite has no notion of the dates types, db.exec will convert all dates parameters to ISO strings before sending them to the database. when retrieving rows from database, date ISO strings will be parsed back to dates objects.

we also used the db.query method, it does the same thing as db.exec but here we inform websql explicitly that we are expecting a list of rows. the library will process the raw SQLResultSet object and extract an array of objects representing the database rows.

by default, db.exec will try already to infer the expected result type by inspecting the sql statement:

SELECT statements are treated to be returning a list of rows, so it will return an array of objects
SELECT with clause LIMIT(1) will by default return a single object
INSERT will return - if any- the new generated id
UPDATE and DELETE will return the number of affected rows
anything else will return the raw SQLResultSet object (returned by the raw execute call from the browser)

while db.exec will try its best to figure out the expected type, it's safer to use the explicit methods below as they make the code intention more apparent

```javascript
db.query(...) 			// use when you want a list of rows as return value
db.queryOne(...) 		// use when you want a single such as when search by an id
db.scalar(...)			// use when you want a scalar value (integer for example) such as when you do "select count(*) from todos"
db.execNonQuery(...)	// use when you want the number of affected rows such as in update and delete statements.
```

## Schema helper methods

Instead of using the basic exec method to issue DDL statements, websql.js includes basic support for managing append only migrations.

the most util is the db.upgrade method. you passes it a modele definition as a JSON object and it will upgrade your database with the new passed 

```javascript
var model = { 
	tables: { 
		todos: {
			task: { type: 'text', required: true, unique: true}, 
			duedate: 'date', 
			completed: 'boolean'
		}			
	}
};
	
db.upgrade(model)
.then(function(res, tx) {		
	// Wonder what that means? see below
	return db.todos.insert({ task: "learn something", duedate: new Date(2013,11, 30), completed: false}).run(tx);			
}).then(function(insertId, tx) {		
	console.log("Last insterted id : " + insertId); 
});
```
(please note that at the moment only append migrations are supported, ie upgrade will inspect for newly added tables and columns and add them to the database. this is mainly because SQLite doesn't support the other operations such as columns modification or removal)

## Table helper methods : insert, update, delete
noted the following instruction in the last example ?

```javascript
db.todos.insert({ task: "learn something", duedate: new Date(2013,11, 30), completed: false}).run();
```

Since you used the upgrade method, your db object got some new fresh properties. those are Table objects that simplifies a lot database interaction.

You have seen the insert method, which obviously insert the passed object in the database

if you want to update an object on the database use db.update
```javascript
db.todos.update({duedate: new Date(2014,1, 30)}, todoId).run();
```

db.destroy send a delete statement. for example, the following deletes all todos
```javascript
//delete a todo with id = 1
db.todos.destroy(1).run();

// delete all completed todos
db.todos.destroy({completed: true}).run();
```

notice how in the samples we always managed to call the run method. that's because the above methods by themselves don't actually send anything to the database but construct a Query object. you can run the Query object by invoking its run  method. additionally you can invoke runQueries in the database object to run multiples queries
```javascript
// construct multiples queries and run them
db.runQueries([
	db.todos.insert({ task: "learn something", duedate: new Date(2013,10, 30), completed: false}),
	db.todos.insert({ task: "learn another thing", duedate: new Date(2013,11, 30), completed: false})
])
.then( ... );
```

##Queries and finder methods

In addition to the insert, update and destroy methods, the Table object also includes helpers to execute queries on the underlying table.
note the helper finders call the run method implicitly.
```javascript
// get the first row, automatically call run
db.todos.all()
.then(function(todos){
	for(var i=0; i<todos.length; i++) {
		...
	}
});

// callback iterator, call the passed function for each returned row
db.todos.each(function(todo) {
	...
});

// get the first row, automatically call run
db.todos.first()
.then(function(firstTodo){
	alert('first thing to do : ' + firstTodo.task);
});

// get the last object, same as first
db.todos.last()
.then( ... )

// get the number of rows
db.todos.count()
.then( function(numOfRows){   ....   } )

// or, get the number of completed todos
db.todos.count({completed: true})
.then( function(numOfcompleted){   ....   } )
```

in addition there is the 'find' method that may ease select statements a lot

```javascript
// find todo with id = 1
db.todos.find(1).run()
.then(function(matchingTodos){ ... });
```

and you can add an array of columns to be returned
```javascript
// find completed todos same as select task, duedate from todos where completed=true
db.todos.find({completed: true}, ['task', 'duedate']).run()
.then(function(matchingTodos){ ... });
```

find method returns also a Query object, this allows us to invoke some useful methods on it.

we can specify a sort order
```javascript
// order by duedate
db.todos.find({completed: true}, ['task', 'duedate']).order('duedate')

// order by duedate desc
db.todos.find({completed: true}, ['task', 'duedate']).order('duedate', true)
```

## Transaction management

In all the above examples we have skipped over how to handle transctions.

basically if you call db.exec, or any of its variants (query, scalar ...) you can either

1- just specify the sql and the paramters arguments, websql.js will automatically create a new transaction and uses it.
example
```javascript
db.exec('insert into todos (task) values(?)', ['some task']) // no explicit transaction parameter
```

2- Additionnally, if you have an existing transaction object, you can passes it to the method
example
```javascript
db.exec('insert into todos (task) values(?)', ['some task'], tx) // tx is an existing transction
```

the some goes for the Query object, you can call the 'run' method with or without an explicit transaction
An important use case to mention is when you are chaining multiples queries together, generally all the queries must share the same transaction. so they will succeed or fail all together. In such case you can the second parameter passed down the promise chain.

For example suppose you have tow tables: contacts and todos, and each contact is saved with many associated todos. normally you want the tow insert operations to occur in the same transctions.
```javascript
var me = {name: 'elouafi yassine'};
var myTodos = [
		{ task: 'something useful', duedate: new Date()},
		{ task: 'something useful', duedate: new Date()}
	];
db.contacts.insert(me).run()	// transaction implicitly created by the library
	.then(funcion(contactId, tx /* original transaction passed down the chain */) {
		var todosInsert = []; // will hold insert queries
		for(var i=0; i<myTodos.length; i++) {
			myTodos[i].contactId = contactId;
			todosInsert.push(db.todos.insert(myTodos[i]));
		}
		return db.runQueries(todosInsert, tx);
		// if we had a single query we would do query.run(tx);
		
	});
```



## Release History
19 oct 2013 : version 0.1 (initial release, alpha)
