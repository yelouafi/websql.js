var websql = websql || {};
var utils = utils || {};

( function($) {
	
	websql.Db = function(db, version, desc, size) {
	
		var self = this;
		this.dbType = "SQLite";
		this.tables = [];
		var regexIso8601 = /^(\d{4}|\+\d{6})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})\.(\d{1,3})(?:Z|([\-+])(\d{2}):(\d{2}))?)?)?)?$/;
		this.cs = { 
			//sql types
			pk: 'pk', text: 'text', integer: 'integer', numeric: 'numeric', date: 'date', bool: 'boolean', 
			//query types
			rowset: 'rowset', row: 'row', scalar: 'scalar', nonQuery: 'non-query', insert: 'insert', any: 'any'
			};
		
		
		this.client = openDatabase(db, version || "1.0", desc || db, size || (2 * 1024 * 1024));
		
		this.tableSQL =	"SELECT name FROM sqlite_master	WHERE type='table' ORDER BY name";
			
		this.modelsTableSchema = {
			model: 'text'				
		};
	
		this.model = {
			tables: {}
		};
		
		self.debug = false;
		self.log = function(obj) {
			if(self.debug) {
				console.log(obj);
			}
		};
		
		this.placeholder = function() {
			return "?";
		};
			
		this.typeToDb = function (p) {
			if (utils.isDate(p)) {
				return p.toISOString();
			}
			if (utils.isBoolean(p)) {
				return p ? 1 : 0;
			}
			return p;
		};
		
		self.inferQueryType = function(sql) {
			var mysql = sql.toLowerCase();
			if(mysql.indexOf('insert') === 0) {
				return self.cs.insert;
			}
			
			if(mysql.indexOf('select') === 0) {
				if(mysql.indexOf('limit(1)') > 0) {
					return self.cs.row;
				}
				
				return self.cs.rowset;
			}
			
			if(mysql.indexOf('update') === 0 || mysql.indexOf('delete') === 0) { 
				return self.cs.nonQuery;
			}
			
			return self.cs.any;
		};
		
		this.processRow = function (row) {
			var obj = {};
			for (var key in row) {
				var value = row[key];
				if (utils.isString(value) && value.match(regexIso8601)) {
					var d = Date.parse(value);
					if (d) {
						value = new Date(d);
					}
				}
				obj[key] = value;
			}
			return obj;
		};	
		
		self.processResultType = function(results, type) {
			switch (type) {
				case self.cs.any:
					return results;
				case self.cs.insert:
					return results.insertId;
				case self.cs.rowset:
					var len = results.rows.length, i;                    
					var rows = [];                    
					for (i = 0; i < len; i++) {
						var item = self.processRow(results.rows.item(i));
						rows.push(item);
					}  
					return rows;
				case self.cs.row:
					if(results.rows.length) {
						return self.processRow(results.rows.item(0));
					}
					return null;
				case self.cs.scalar: 
					if(results.rows.length) {
						var obj = self.processRow(results.rows.item(0));
						for(var key in obj) {
							return obj[key];
						}
					}
					return null;
				case self.cs.nonQuery:
					return results.rowsAffected;
				default:
					return results;
			}
			
		};
		
		var _translateType = function (typeName) {
			var _result = typeName;

			switch (typeName) {
			case "pk":
				_result = "INTEGER PRIMARY KEY  AUTOINCREMENT";
				break;
			case "int":
				_result = "INTEGER";
				break;
			case "decimal":
				_result = "numeric";
				break;
			case "date":
				_result = "datetime";
				break;
			case "text":
				_result = "text";
				break;
			case "boolean":
				_result = "boolean";
				break;
			}
			return _result;
		};

		this.forward = function(res, tx) {		
			return $.Deferred( function(d) {
				d.resolve(res, tx);
			}).promise();		
		};
		
		var successWrapper = function (d) {
			return function (tx, results) {
				var ret = self.processResultType(results, d.queryType);
				d.resolve(ret, tx);
			};
		};

		var failureWrapper = function (d) {
			return function (tx, error) {
				self.log("sql error on : " + d.sql + " --- message: " + error.message);
				d.reject(error);
				return true;
			};
		};		
		
		this._exec = function(sql, params, tx, queryType) {
			var sp = params ? params.join(", ") : "" ;
			self.log("exec : " + sql + " : [" + sp  + "]");
			return $.Deferred(function (d) {           
				var _args = params ? params.map(self.typeToDb) : params;
				d.sql = sql;
				d.queryType = queryType || self.cs.any;
				if(tx) {                
					tx.executeSql(sql, _args, successWrapper(d), failureWrapper(d));
				} else {
					self.client.transaction(function(tx1){                       
						tx1.executeSql(sql, _args, successWrapper(d), failureWrapper(d));
					});
				}
			});
		};
		
		self.query = function(sql, params, tx) {
			return self._exec(sql, params, tx, self.cs.rowset);
		};
		
		self.queryOne = function(sql, params, tx) {
			return self._exec(sql, params, tx, self.cs.row);
		};
		
		self.scalar = function(sql, params, tx) {
			return self._exec(sql, params, tx, self.cs.scalar);
		};
		
		self.execNonQuery = function(sql, params, tx) {
			return self._exec(sql, params, tx, self.cs.nonQuery);
		};
		
		self.exec = function (sql, params, tx, queryType) {
			var qt = queryType || self.inferQueryType(sql);
			return self._exec(sql, params, tx, qt); 
		};
		
		this.getQuery = function (sql, params, queryType) {
			return new websql.Query(sql, params, new websql.Table('', '', self), queryType);
		};
		
		this.fnRunQuery = function(qry) {
			return function( res, tx ) {
				return qry.run(tx);
			};
		};
		
		this.runQueries = function( queries, tx ) {
			var promise = queries[0].run(tx);
			for( var i = 1; i < queries.length; i++) {
				var qry = queries[i];
				promise = promise.then( self.fnRunQuery(qry) );
			}
			return promise;
		};
		
		this.runSqls = function( sqls, tx ) {
			var table = new websql.Table('', '', self);
			var queries = sqls.map(function(sql) {
				if(Array.isArray(sql)) {
					return new websql.Query( sql[0], sql.slice(1), table, self.cs.any );
				} else {
					return new websql.Query( sql.toString(), [], table, table, self.cs.any );
				}
			});
			return self.runQueries( queries, tx );			
		};
		
		this.dropTable = function (tableName) {
			return new websql.Query("DROP TABLE IF EXISTS " + tableName, [], new websql.Table(tableName, "", self), self.cs.any);
		};	
		
		var _createColumn = function (columnName, columnProps) {        
			if(utils.isString(columnProps)) {
				return columnName + " " + _translateType(columnProps);
			}
			return columnName + " " + _translateType(columnProps.type) +
					( columnProps.required ? " NOT NULL" : "" ) +
					( columnProps.unique ? " UNIQUE" : "");        
		};

		this.createTable = function (tableName, columns, checkExists) {

			var _sql = "CREATE TABLE " + ( checkExists ? "IF NOT EXISTS " : "" ) + tableName + "(";
			var _cols = [];			

			_cols.push( _createColumn( 'id', "pk" ) );
			for (var c in columns) {
				if (c === "timestamps") {
					_cols.push("created_at int");
					_cols.push("updated_at int");
				} else if (c !== 'id') {
					_cols.push( _createColumn( c, columns[c] ) );
				}
			}


			_sql += _cols.join(", ") + ")";
			return new websql.Query(_sql, [], new websql.Table(tableName, "id", self), self.cs.any);		
		};
		
		this.createColumn = function(tableName, columnName, columnProps) {		
			return new websql.Query("ALTER TABLE " + tableName + " ADD COLUMN " + _createColumn( columnName, columnProps ), [], new websql.Table(tableName, "", self), self.cs.any);
		};
		
		this.createModelsTable = function() {
			return self.createTable('_models', self.modelsTableSchema, true /* if not exists */);
		};
		
		this.loadModel = function(tx) {
			var p = self.createModelsTable().run(tx)
					.then( function( res, tx ) {
						self._models = new websql.Table("_models", "id", self);
						return self._models.last(tx);
					})
					.then( function(modelAsJson, tx) {
						if(modelAsJson) {
							self.model = JSON.parse(modelAsJson.model);	
						}					
						return self.forward(self.newModel, tx);						
					});		
			return p;
		};
		
		this.reloadModel = function(tx) {
			self._models.last(tx)
			.then( function(modelAsJson, tx) {
				if(modelAsJson) {
					self.model = JSON.parse(modelAsJson.model);	
				}					
				return self.forward(self.newModel, tx);						
			});	
		};
		
		this.upgrade = function(newModel, tx) {
			return self.loadModel(tx)
				.then(function(res, tx) {
					var queries = [];				
					//self.model now contains the current model						
					utils.each( newModel.tables, function(table, tableName) {
						if( ! utils.has( self.model.tables, tableName ) ) {
							queries.push( self.createTable( tableName, table ) );
						} else {
							var oldColumns = self.model.tables[tableName];	
							var newColumns = newModel.tables[tableName];
							utils.each( newColumns, function (column, columnName) {
								if( ! utils.has(oldColumns, columnName) ) {
									queries.push( self.createColumn( tableName, columnName, column ) );
								}
							});
						}
					});
					if(queries.length) {
						queries.push( self._models.insert( { model: JSON.stringify(newModel) }) );
						return self.runQueries( queries, tx );								
					} else {
						return self.forward(res, tx);
					}
										
				})			
				.then(function(res, tx) {
					self.model = newModel;
					utils.each( newModel.tables, function(table, tableName) {
						self[tableName] = new websql.Table(tableName, "id", self);
					});
					return self.forward(res, tx);
				});
		};
		
		
	};
	
	websql.Query = function(sql, params, table, queryType) {
	
		var operationsMap = {
			'=': '=',
			'!': '!=',
			'>': '>',
			'<': '<',
			'>=': '>=',
			'<=': '<=',
			'!=': '<>',
			'<>': '<>'
		};
		
		var self = this;
		self.sql = sql;
		self.params = params || [];
		self.table = table;
		self.db = table.db;
		self.queryType = queryType;
		
		
		self.append = function (sql) {
			self.sql += (arguments.length === 1 ? sql : utils.format.apply(null, utils.toArray(arguments)) );
			return self;
		};
		
		self.order = function (sort, desc) {
			return self.append(" ORDER BY {0}{1}", sort, (desc ? " DESC" : "") );			
		};

		self.limit = function (count, offset) {
			return utils.isUndef(offset) ? self.append(" LIMIT {0}", count) : self.append(" LIMIT {0} OFFSET {1}", count, offset);			
		};
		
		self.first = function () {
			return self.append(" LIMIT(1)");
		};

		self.last = function () {
			return self.append(" ORDER BY {0} DESC LIMIT(1)", self.table.pk);			
		};
		
		self.where = function (conditions) {
			if (utils.isUndef(conditions)) {
				return self;
			}

			if (utils.isNumber(conditions)) {
				return self.append(' WHERE "{0}" = {1}', self.table.pk, conditions);
			}
			
			if (utils.isString(conditions)) {
				self.params.push(conditions);
				return self.append(' WHERE "{0}" = {1}', self.table.pk, self.db.placeholder(self.params.length));
			}
			
			var _conditions = [];
			for(var key in conditions) {
				var value = conditions[key];
				
				var parts = key.trim().split(/ +/);
				var property = parts[0];
				var operation = operationsMap[parts[1]] || '=';				

				if (!Array.isArray(value)) {
					self.params.push(value);
					_conditions.push(utils.format('"{0}" {1} {2}', property, operation, self.db.placeholder(self.params.length)));
				} else {
					var arrayConditions = [];
					value.forEach(function(v) {					
						self.params.push(v);
						arrayConditions.push(self.db.placeholder(self.params.length));
					});
					_conditions.push(utils.format('"{0}" {1} ({2})', property, operation === '!=' || operation === '<>' ? 'NOT IN' : 'IN', arrayConditions.join(', ')));
				}				
			}			
			return self.append(' WHERE ' + _conditions.join(' AND '));
		};
		
		self.parseArgs = function (args) {
			var _args = utils.toArray(args);
			
			if (_args.length === 0) {
				return self;
			}
			
			var columns;
			
			_args.forEach(function(arg) {
				if (utils.isNumber(arg) || utils.isString(arg)) {
					var criteria = {};
					criteria[self.table.pk] = arg;
					self.where(criteria);
				} else  if (Array.isArray(arg)) {					
					columns = arg;
				} else  if(utils.isObject(arg)) {																		
					var where = arg.where || arg;
					columns = arg.columns;
					
					if (utils.isObject(where)) {
						self.where(where);
					}
				}				
			});
			
			if(columns) {
				self.sql = self.sql.replace("*", columns.join(",") );
			}					
		
			return self;
		};
		
		this.find = function() {
			self.sql = "select * from " + self.table.name;
			return self.parseArgs(arguments);			
		};
		
		this.run = function(tx, queryType) {
			var qt = queryType || self.queryType || self.db.cs.any;
			return self.db._exec(self.sql, self.params, tx, qt);
		};
		
		this.all = function(tx) {
			return self.db._exec(self.sql, self.params, tx, self.db.cs.rowset);
		};
		this.one = function(tx) {
			return self.db._exec(self.sql, self.params, tx, self.db.cs.row);
		};
		this.scalar = function(tx) {
			return self.db._exec(self.sql, self.params, tx, self.db.cs.scalar);
		};
		this.nonQuery = function(tx) {
			return self.db._exec(self.sql, self.params, tx, self.db.cs.nonQuery);
		};
		this.each = function(tx, cb) {
			var d = self.all(tx);
			if(cb) {
				d.done(function(res) {
					var len = res.length;
					for(var i=0; i<len; i++) {
						cb(res[i]);
					}
				});
			}
			return d;
		};
		

	};

	
	websql.Table = function (tableName, pk, _db) {
		var self = this;
		this.name = tableName;
		this.pk = pk;
		this.db = _db;
		
		this.find = function() {
			return new websql.Query("SELECT * FROM " + this.name, [], this).parseArgs(arguments);
		};
		
		this.first = function(tx) {
			return self.find().first().run(tx, self.db.cs.row);
		};
		
		this.last = function(tx) {
			return self.find().last().run(tx, self.db.cs.row);
		};
		
		this.each = function(tx) {
			this.find().each(tx);
		};
  
		this.count = function(where) {
			return new websql.Query("SELECT COUNT(1) FROM " + self.name, [] ,self, self.db.cs.scalar).where(where);
		};
		
		this.all = function(tx) {
			return new websql.Query("SELECT * FROM " + self.name, [], self).all(tx);
		};
		
		this.insert = function(data) {
			if(!data) {
				throw "insert should be called with data";//{ return new Query().raiseError("insert should be called with data"); }
			}
			
			var sql = utils.format("INSERT INTO {0} ({1}) VALUES(", self.name, Object.keys(data).join(", "));
			var params = [];
			var values = [];
			
			var seed = 0;
			for(var key in data) {
				values.push( self.db.placeholder(++seed) );
				params.push( data[key] );
			}			
			
			sql += values.join(", ") + ")";
			return new websql.Query(sql, params, self, self.db.cs.nonQuery);
		};
		
		this.update = function(fields, where){
			if(utils.isObject(fields) === false) {
				throw "Update requires a hash of fields=>values to update to";
			}

			var params = [];
			var values = [];			
			var seed = 0;
			
			for(var key in fields) {
				values.push( key + ' = ' + self.db.placeholder(++seed) );
				params.push( fields[key] );
			}		
			
			var sql = utils.format("UPDATE {0} SET {1}", this.name, values.join(', '));
			return new websql.Query(sql, params, self, self.db.cs.nonQuery).where(where);
		};
		
		this.destroy = function() {
            return new websql.Query("DELETE FROM " + self.name, [], self, self.db.cs.nonQuery).parseArgs(arguments);
        };
	};
	
} (jQuery) );