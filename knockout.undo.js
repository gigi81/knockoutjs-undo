if(!Array.isArray) {
	Array.isArray = function (vArg) {
		return Object.prototype.toString.call(vArg) === "[object Array]";
	};
}

ko.undoService = initUndoService();

function undoStack() {
    var _self = {};
    var _stack = new Array();
    var _position = -1; //current position in the array

    _self.current = function() {
        if(arguments.length <= 0) {
            //read
            if(_position < 0)
                return null;

            return _stack[_position];
        }
        else {
            //write
            _stack[++_position] = arguments[0];
            if((_stack.length - 1) > _position) {
                _stack = _stack.slice(0, _position + 1);
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
}


function initUndoService() {
    var _self = {};
	var _contexts = new Array();
    var _stack = new Array();
	
	_self.MainContext = "__main";

	_self.getContextIndex = function(context) {
		for(var i = 0; i < _contexts.length; i++) {
			if(_contexts[i] == context)
				return i;
		}
		
		_contexts.push(context);
		return _contexts.length - 1;
	};
	
	_self.getContext = function(context) {
		if(context == null) {
			context = _self.MainContext;
		}

		var index = _self.getContextIndex(context);
		if(_stack[index] != null)
			return _stack[index];
		
		var stack = _stack[index] = new undoStack();
		//needed for computed to work
		stack.observable = ko.observable(0);
		
		//we need a fake first item to init the undostack
		stack.current({
			undo : function(){},
			redo: function(){}
		});
		
		stack.canUndo = ko.computed(function() {
			stack.observable(); //needed for computed to work
			return stack.hasPrevious();
		}, _self);

		stack.canRedo = ko.computed(function() {
			stack.observable(); //needed for computed to work
			return stack.hasNext();
		}, _self);
		
		stack.changed = function() {
			stack.observable(stack.observable() + 1);
		};
		
		return stack;
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
    };

    _self.redo = function(context) {
		var ctx = _self.getContext(context);
		
        if(!ctx.hasNext())
            return;

        ctx.next().redo();
        ctx.changed();
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
	}

    return _self;
};

function __getUndoValue(value) {
    if(!Array.isArray(value))
        return value;

    return value.slice(0);
}

ko.extenders.undo = function(target, option) {
    var _stack = undoStack();
    var _suspend = false;
	var _context = null;
	if(option && option.context)
		_context = option.context;
	
    /* initialValue */
    _stack.current(__getUndoValue(target()));

    var _subscription = target.subscribe(function(newValue) {
        if(_suspend)
            return;

        _stack.current(__getUndoValue(newValue));
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

