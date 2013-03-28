knockoutjs-undo
===============

Undo support for knockoutjs as an extender.

Example
===============

this.firstName = ko.observable(first).extend({undo:{}});

Or with an undo context:

this.firstName = ko.observable(first).extend({undo:{context: this}});