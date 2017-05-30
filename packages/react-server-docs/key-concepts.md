# Key Concepts: Stores, State, Actions, and Root Elements.

Having outlined the basic principles, let's look at the key concepts of this proposal: Stores, State, Actions, and Root Elements.

*Root Elements* are mounted React elements that are at the root of their render tree (i.e. React elements currently in the document that had "React.render" called on them.) Root State is passed into them as props. There can be multiple Root Elements in a page (as when `getElements` returns an array in react-server).

*State* is an object representing the state of a Store at any particular point in time. It is separate from the Store in that it does not respond to Actions. The State from the various Stores is bundled up into Root State and passed to Root Elements; Stores are *not* passed to Root Elements. Ideally, State would be an immutable data structure, but it can be mutable.

*Root State* is an aggregation of one or more States from one or more Stores in the App that is then passed into a Root Element. Note that there can be multiple Root States, because there can be multiple Root Elements in a page.

*Stores* are objects that hold State and manage the changes to the State.

*Actions* are events that fire from elements anywhere in the render tree. Stores listen to Actions and potentially mutate State in response.

With these terms, let's chart out what a typical data flow would look like:

1. User clicks a button in the UX.
2. The button's React `onClick` fires, causing a method in the React class to fire an action:
```
    var updateCalculationAction = require("./calcActions").update;

    // snip boiler plate react definition.
    onButtonClick: function(e) {
        // signal to the Store that we need to update the calculation.
        updateCalculationAction();
    }
```
1. A store that is listening to that Action updates its state by calling `setState`.
```
    var updateCalculationAction = require("./calcActions").update;

    module.exports = Data.createStore({
      init: function() {
        listenTo(updateCalculationAction, this.updateCalc);
      },

      updateCalc: function() {
        var newValueForCalc = doCalc();

        // this call sets a new value for this.state.calculation, and automatically fires
        // a change.
        this.setState({calculation: newValueForCalc});
      }
    });
```
1. The call to `setState` triggers a change event to be fired from the Store. If the Store is a child of a parent Store, then the change event is propagated up to the root. At the root, the change event for the Store has a handler that will bundle the Root State and pass it over to the Root Element.

1. The Root Element will pass down subparts of the State to its children, who will pass down subparts to their children, and the current State will be rendered.

# API

## `Actions`

I think we should actually just use the [Actions from refluxjs](https://github.com/spoike/refluxjs#creating-actions). They are easy to create, they have an awesome pattern for child actions that fire on completion or error, and they are just functions.

The only change I would propose is just aliasing `Actions.createActions` to `Reflux.createActions`.

## Stores

### `Stores`

`Stores` is a JS helper for creating Store Factory functions. Stores are for holding data. Note that a Store is a Reflux Store instance.

```
// in MyStore.js
module.exports = Stores.createStoreFactory({
  myFunc() {
    console.log("here is a custom function");
  }
});

// in MyPage.js

var MyStore = require("./MyStore");

module.exports = class MyPage {
  handleRoute(request) {
    this.store = MyStore("foo");
  }
};
```

Stores are event emitters, so they can be listened to using normal Event Emitter listener code.

### `Store.state`
The Store instance will have a `this.state` object, representing its current State. Like React, `this.state` should be considered to be an immutable, and attributes of `this.state` should _never_ be set. Stores are, however, free to read attributes from the state.

### `Store.setState(state: Object)`
Like React, this method merges `state` into the current `this.state`:

```
// in a Store method.
console.log(this.state); // output: {foo:1, bar:2}
this.setState({bar:3, qux: 4}); // state will now be: {foo:1, bar:3, qux:4}
```
Also like React, `setState` may be carried out asynchronously (in order to batch up multiple Stores' changes), so `this.state` may not change immediately after a call to `this.setState()`.

The `setState` method also emits a `change` event so that listeners will know that the Store's State has changed.

#### Child Stores
Also, if the value of any of the keys in the `state` argument is a Store, then the value in `this.state` will be that child Store's State, not the child Store itself. Further, adding a child store in this way will automatically make this Store listen to that child Store's change events. This means that hooking up parent and child Stores is generally as easy as
```
this.setState({propertyHistory: new propertyHistoryStore});
```
If you need something more intricate than Stores just listening to their child Stores, you can hook up Stores manually to listen to changes in other Stores. However, it is important to make sure that event listening tree doesn't have cycles. If a cycle of `setState` calls occurs, the framework will throw an Error.

#### Pending Values

Many stores fetch data via asynchronous processes, often an HTTP JSON call. To make it easy to code asynchronous values into a Store, we have the notion of _Pending Values_. If you call `setState` and the value of a property is a Promise (or any `then`-able), then that name is not immediately added to `state`. Instead, once the promise resolves, the name is added to `state` with the value of the resolved promise. If the promise rejects, then the name is added with the value being the error that was thrown. (TODO: is that right? sounds hard to use in error cases.)

```
var A = Stores.createStoreFactory({})();
A.setState({a: 1});
var deferred = Q.defer();

A.setState({b: deferred.promise});

console.log(A.state); // {a:1}

setTimeout(() => {
  deferred.resolve(2);
}, 2);

setTimeout(() => {
  console.log(A.state); // {a:1, b:2}
}, 1000);
```

### `Store.when(names: String | [String]) : Promise(Object)`

Returns a promise that resolves when all of the values with names in `names` have a non-pending non-`undefined` value.

The value of the promise is a hash of the names to their values.

### `Store.whenResolved() : Promise(Object)`

Returns a promise that resolves when there are no more pending values in the Store's `state`.

## RootElements

### `RootElements.createRootElement(store: Store, element: ReactElement | Function(props: Object) : ReactElement) : ReactElement`

Takes in a Store and a ReactElement or a Function to create a Root Element that is linked in a one-way data flow with the Store.

If `element` is a ReactElement, the Root Element will be that element with a `prop` for every key-value pair in the Store's `state` mixed in. Any change events in the Store will automatically update the Root Element's props and, of course, force a re-render.

If `element` is a Function, it will be called every time the Store updates with the state, and it should return a ReactElement that should be used at that moment. This is useful, for example, for mapping names that the Store uses to names that the control uses:

```
// imagine store has fields foo and bar, which you want
// to put into a React component's props baz and qux.
var element = RootElements.createRootElement(store, (props) => {
    return <MyComponent foo={props.baz} bar={props.qux}/>;
});
```

This method would be most likely called in react-server's Page API method `getElements`.

### `RootElements.createRootElementWhen(names: [String], store: Store, element: ReactElement | Function(props: Object) : ReactElement) : EarlyPromise(ReactElement)`

Returns an `EarlyPromise` of a ReactElement that resolves when all the values in `names` are not pending and not `undefined`.

If `element` is a ReactElement, the Root Element will be that element with a `prop` for every key-value pair in the Store's `state` mixed in. Any change events in the Store will automatically update the Root Element's props and, of course, force a re-render. Note that *all* of the Store's `state` is mixed in to the Root Element, not just the properties referenced in `names`.

If `element` is a Function, it will be called every time the Store updates with the state, and it should return a ReactElement that should be used at that moment.

If the Promise is resolved Early, it returns the Element that would be created with the state available at the time.

### `RootElements.createRootElementWhenResolved(store: Store, element: ReactElement | Function(props: Object) : ReactElement) : EarlyPromise(ReactElement)`

Exactly like `createRootElementWhen`, except that the resulting EarlyPromise resolves when there are no pending values in `state`.
