ko.undoStack = function() {
	var _self = {};
	var _stack = new Array();
	var _position = -1; //current position in the array
	var _maxDepth = 100;

	_self.current = function() {
		//read
		if(arguments.length <= 0) {
			if(_position < 0)
				return null;

			return _stack[_position];
		}
		//write
		else {
			/* add element to the stack */
			_stack[++_position] = arguments[0];
			
			/* if we just added an element in the middle of the stack
			   we remove all the other elements after, so it becomes the last one */
			if((_stack.length - 1) > _position) {
				_stack = _stack.slice(0, _position + 1);
			}
			
			/* limit the undo depth */
			if(_stack.length > _maxDepth) {
				var remove = stack.length - _maxDepth;
				_stack = _stack.slice(remove);
				_position -= remove;
			}
		}
	};

	_self.previous = function() {
		if(!_self.hasPrevious())
			return;

		return _stack[--_position];
	};

	_self.next = function() {
		if(!_self.hasNext())
			return;

		return _stack[++_position];
	};

	_self.hasPrevious = function() {
		return _position > 0;
	};

	_self.hasNext = function() {
		return _position < (_stack.length - 1);
	};

	_self.position = function() {
		return _position;
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
		var _stack = new ko.undoStack();
		//needed for computed canUndo and canRedo to work
		var _observable = ko.observable(0);
		
		//we need to fake a first item to init the undostack
		_stack.current({
			undo : function(){},
			redo: function(){}
		});
		
		_stack.canUndo = ko.computed(function() {
			_observable(); //needed for computed to work
			return _stack.hasPrevious();
		}, _self);

		_stack.canRedo = ko.computed(function() {
			_observable(); //needed for computed to work
			return _stack.hasNext();
		}, _self);
		
		_stack.changed = function() {
			_observable(_observable() + 1);
		};

		/* make the context capable of generating events */
		ko.subscribable.call(_stack);
		
		return _stack;
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
		return _stack[index] = _self.createContext();
	};
	
	_self.add = function(item, context) {
		var ctx = _self.getContext(context);
		ctx.current(item);
		ctx.changed();
	};

	_self.undo = function(context) {
		var ctx = _self.getContext(context);
		
		if(!ctx.hasPrevious())
			return;

		ctx.current().undo();
		ctx.previous();
		ctx.changed();
		ctx.notifySubscribers({}, "undo");
		ctx.notifySubscribers({}, "changed");
	};

	_self.redo = function(context) {
		var ctx = _self.getContext(context);
		
		if(!ctx.hasNext())
			return;

		ctx.next().redo();
		ctx.changed();
		ctx.notifySubscribers({}, "redo");
		ctx.notifySubscribers({}, "changed");
	};
	
	_self.canUndo = function(context) {
		return _self.getContext(context).canUndo;
	};

	_self.canRedo = function(context) {
		return _self.getContext(context).canRedo;
	};
	
	_self.createModel = function(context) {
		return {
			canUndo: _self.canUndo(context),
			canRedo: _self.canRedo(context),
			undo: function() {
				_self.undo(context);
			},
			redo: function() {
				_self.redo(context);
			}
		};
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
	var _context = (option && option.context) ? option.context : null;
	
    /* initialValue */
    _stack.current(ko.undoService.getValue(target()));

    var _subscription = target.subscribe(function(newValue) {
        if(_suspend)
            return;

        _stack.current(ko.undoService.getValue(newValue));
        ko.undoService.add(target, _context);
    });

    target.undo = function() {
        if(!_stack.hasPrevious())
            return;

        _suspend = true;
        target(_stack.previous());
        _suspend = false;
    }

    target.redo = function() {
        if(!_stack.hasNext())
            return;

        _suspend = true;
        target(_stack.next());
        _suspend = false;
    }

    return target;
};

