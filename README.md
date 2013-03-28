knockoutjs-undo
===============

Undo support for knockoutjs as an extender.

Usage Example
===============

this.firstName = ko.observable(first).extend({undo:{}});

Or with an undo context:

this.firstName = ko.observable(first).extend({undo:{context: this}});


Working demo
==============
http://gigi81.github.com/knockoutjs-undo/demo.html
