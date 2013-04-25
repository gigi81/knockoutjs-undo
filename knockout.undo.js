ko.undoStack = function() {
	var _self = {};
	var _values = new Array();
	var _position = -1; //current position in the array
	var _maxDepth = 100;

    _self.getCurrent = function() {
        if (_position < 0)
            return null;

        return _values[_position];
    };
    
    _self.setCurrent = function (value) {
		/* add element to the stack */
		_values[++_position] = value;
			
		/* if we just added an element in the middle of the stack
			we remove all the other elements after, so it becomes the last one */
		if((_values.length - 1) > _position) {
			_values = _values.slice(0, _position + 1);
		}
			
		/* limit the undo depth */
		if(_values.length > _maxDepth) {
			var remove = stack.length - _maxDepth;
			_values = _values.slice(remove);
			_position -= remove;
		}
	};

	_self.previous = function() {
		if(!_self.hasPrevious())
			return;

		return _values[--_position];
	};

	_self.next = function() {
		if(!_self.hasNext())
			return;

		return _values[++_position];
	};

	_self.hasPrevious = function() {
		return _position > 0;
	};

	_self.hasNext = function() {
		return _position < (_values.length - 1);
	};

	_self.position = function() {
		return _position;
	};
	
	_self.clear = function() {
		_values = new Array();
		_position = -1;
	};

	return _self;
};

ko.undoService = function() {
	var _self = {};
	var _contexts = new Array();
	var _stack = new Array();
	
	_self.MainContext = "__main";

	_self.getContextIndex = function(context) {
		/* search for the specified context */
		for(var i = 0; i < _contexts.length; i++) {
			if(_contexts[i] == context)
				return i;
		}
		
		/* if not found add a new context */
		_contexts.push(context);
		return _contexts.length - 1;
	};
	
	_self.createContext = function() {
		var ctx = new ko.undoStack();
		//needed for computed canUndo and canRedo to work
		var _changes = ko.observable(0);
		var _source = null;
		
		var _createUndoItem = function(item) {
			var self = {};
			
			if(item == null) {
				item = {
					undo : function(){},
					redo: function(){}
				};
			};
			
			self.source = _source;
			self.items = [item];
			self.undo = function() {
				for(var i = self.items.length - 1; i >= 0; i--) {
					self.items[i].undo();
				}
			};
			self.redo = function() {
				for(var i=0; i < self.items.length; i++) {
					self.items[i].redo();
				}
			};
			
			return self;
		};
		
		ctx.canUndo = ko.computed(function() {
			_changes(); //needed for computed to work
			return ctx.hasPrevious();
		}, _self);

		ctx.canRedo = ko.computed(function() {
			_changes(); //needed for computed to work
			return ctx.hasNext();
		}, _self);
		
		ctx.changed = function(change) {
			_changes(_changes() + change);
		};
		
		ctx.isChanged = ko.computed({
			read: function () {
				return _changes() != 0;
			},
			write: function (value) {
				_changes(value ? 1 : 0);
			},
			owner: ctx
		});
		
		ctx.resetChanges = function() {
			ctx.clear();
			//we need to fake a first item to init the undostack
			ctx.setCurrent(_createUndoItem());
			_changes(0);
		};

	    ctx.undo = function() {
	        if (!ctx.hasPrevious())
	            return;

	        ctx.getCurrent().source = null;
	        ctx.getCurrent().undo();
	        ctx.previous();
	        ctx.changed(-1);
	        ctx.notifySubscribers({}, "undo");
	        ctx.notifySubscribers({}, "changed");
	    };
		
		ctx.redo = function() {
			if(!ctx.hasNext())
				return;

			ctx.next().redo();
			ctx.changed(1);
			ctx.notifySubscribers({}, "redo");
			ctx.notifySubscribers({}, "changed");
		};
		
		ctx.add = function(item) {
			var current = ctx.getCurrent();
			
			//if the source is not changed add the item to the current change set
			if((_source != null) && (current.source === _source)) {
				current.items.push(item);
			}
			else {
				current.source = null;
				ctx.setCurrent(_createUndoItem(item));
				ctx.changed(1);
			}
		};
		
		ctx.setChangesSource = function(source) {
			_source = source;
		};
		
		ctx.resetChangesSource = function() {
			_source = null;
		};

		//init the context
		ctx.resetChanges();

		/* make the context capable of generating events */
		ko.subscribable.call(ctx);
		
		return ctx;
	};
	
	_self.undoable = function(context, ctx) {
		if(ctx == null) {
			ctx = _self.getContext(context);
		}
	
		context.canUndo = ctx.canUndo;
		context.canRedo = ctx.canRedo;
		context.undo = function() {
			ctx.undo();
		};
		context.redo = function() {
			ctx.redo();
		};
		context.isChanged = ctx.isChanged;
		context.resetChanges = function() {
			ctx.resetChanges();
		};
		context.setChangesSource = function(source) {
			ctx.setChangesSource(source);
		};
		context.resetChangesSource = function() {
			ctx.resetChangesSource();
		};
	};
	
	_self.getContext = function(context) {
		if(context == null) {
			context = _self.MainContext;
		}

		/* try to get an existing context */
		var index = _self.getContextIndex(context);
		if(_stack[index] != null)
			return _stack[index];

		/* if not found create a new context */
		var ret = _stack[index] = _self.createContext();
		_self.undoable(context, ret); //mixin the undo methods and properties
		return ret;
	};
	
	_self.getValue = function(value) {
		//if it's not an array just return it
		if(Object.prototype.toString.call(value) !== "[object Array]")
			return value;

		/* return a clone of the array */
		return value.slice(0);
	};

	return _self;
}();

ko.extenders.undo = function(target, option) {
    var _stack = new ko.undoStack();
    var _suspend = false;
	var _context = ko.undoService.getContext((option && option.context) ? option.context : null);
	
    /* initialValue */
    _stack.setCurrent(ko.undoService.getValue(target()));

    var _subscription = target.subscribe(function(newValue) {
        if(_suspend)
            return;

        _stack.setCurrent(ko.undoService.getValue(newValue));
        _context.add(target);
    });

    target.undo = function() {
        if (!_stack.hasPrevious())
            return;

        _suspend = true;
        target(ko.undoService.getValue(_stack.previous()));
        _suspend = false;
    };

    target.redo = function() {
        if (!_stack.hasNext())
            return;

        _suspend = true;
        target(ko.undoService.getValue(_stack.next()));
        _suspend = false;
    };

    return target;
};

