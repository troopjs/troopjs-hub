define([
  "buster",
  "../component",
  "../emitter",
  "troopjs-core/component/signal/start",
  "troopjs-core/component/signal/finalize"
], function (buster, Gadget, emitter, start, finalize) {
  "use strict";

  var assert = buster.referee.assert;
  var refute = buster.referee.refute;

  var ARRAY_PROTO = Array.prototype;
  var ARRAY_CONCAT = ARRAY_PROTO.concat;
  var TOPIC = "TEST";
  var TEST_ARGS = [ "abc", "", 1, 0, false, true, {} ];
  var APPLY_ARGS = ARRAY_CONCAT.call(ARRAY_PROTO, [ TOPIC ], TEST_ARGS);
  var NAME_HANDLER = "__test_handlers";

  /**
   * compare a array of expected result with actual result
   */
  function allSame (actual, expected) {
    var l = expected.length;
    while (l--) {
      assert.same(expected[l], actual[l]);
    }
  }

  buster.testCase("troopjs-hub/component", {
    "empty phase is protected": function () {
      var spy = this.spy();
      var component = Gadget.create();

      component.on("hub/foo/bar", spy);

      return emitter
        .emit("foo/bar", 1, true, "test")
        .tap(function () {
          refute.called(spy);
        })
        .tap(function () {
          return start.call(component)
        })
        .tap(function () {
          return finalize.call(component);
        });
    },

    "publish/subscribe": {
      "setUp": function () {
        var me = this;
        var insts = me.instances = [];

        me.registerInstance = function (instance) {
          var found = false;
          var inst;
          var l = insts.length;

          while (l--) {
            inst = insts[l];

            if (inst === instance) {
              found = true;
              break;
            }
          }

          if (found) {
            return;
          }

          me.instances.push(instance);
        };

        // helper to subscribe topic,
        // all subscription will be cleaned in teardown
        me.on = function (context, topic, func) {
          if (!context[NAME_HANDLER]) {
            context[NAME_HANDLER] = [];
          }

          me.registerInstance(context);

          // call the real subscribe
          context.on("hub/" + topic, func);

          context[NAME_HANDLER].push({
            "topic": topic,
            "func": func
          });

          return me;

        };
      },

      "tearDown": function () {
        var me = this;
        var l;
        var m;
        var handler;
        var handlers;
        var inst;
        var insts = me.instances;

        l = insts.length;

        // clear up all subscription
        while (l--) {
          inst = insts[l];

          if (!inst[NAME_HANDLER]) {
            continue;
          }

          handlers = inst[NAME_HANDLER];
          m = handlers.length;

          while (m--) {
            handler = handlers[m];

            inst.off("hub/" + handler.topic, handler.func);
          }

          // pop out instance at last
          insts.pop();

        }
      },
      // POSITIVE TESTS
      "without exception when there is no subscriber": function () {
        return emitter.emit(TOPIC).then(function () {
          assert(true);
        });
      },

      "different topics should not interfere with each other": function () {
        var g1 = new Gadget();

        this
        .on(g1, TOPIC + "diff", function () {
          assert(false);
        })
        .on(g1, TOPIC, function (test) {
          assert(test);
        });

        return emitter.emit(TOPIC, true);
      },

      "//with args": function () {
        var g1 = new Gadget();

        this.on(g1, TOPIC, function () {
          allSame(arguments, TEST_ARGS);
        });

        return emitter.emit(APPLY_ARGS);
      },

      "multiple times and in order": function () {
        var g1 = new Gadget();

        var spy = this.spy();

        this
        .on(g1, TOPIC, spy)
        .on(g1, TOPIC, function () {

          assert.called(spy);

          allSame(arguments, TEST_ARGS);
        });

        return emitter.emit.apply(emitter, APPLY_ARGS);
      },

      "cross gadget": function () {
        var g1 = new Gadget();

        this.on(g1, TOPIC, function () {
          allSame(arguments, TEST_ARGS);
        });

        return emitter.emit.apply(emitter, APPLY_ARGS);
      }
    },

    "publish/subscribe - matches context": function () {

      var count = 0;
      var g1 = Gadget.create({
        "hub/foo": function () {
          count++;
          assert.same(g1, this);
        }
      });

      var g2 = Gadget.create({
        "hub/foo": function () {
          count++;
          assert.same(g2, this);
        }
      });

      return start.call(g1).then(function () {
        return start.call(g2).then(function () {
          return emitter.emit("foo").then(function () {
            assert.same(2, count);
          });
        });
      });
    },

    "publish/subscribe - memory": function () {
      var spy1 = this.spy();
      var spy2 = this.spy();

      var g1 = Gadget.create({
        "hub/foo/bar(true)": function () {
          spy1.apply(spy1, arguments);
        },
        "hub/foo/bar": function () {
          spy2.apply(spy1, arguments);
        }
      });

      return emitter.emit("foo/bar", "foo", "bar").then(function () {
        // None of them should be called because component not yet started.
        refute.called(spy1);
        refute.called(spy2);

        return start.call(g1).then(function () {
          // Only the handler declared with memory if is called.
          assert.calledWithExactly(spy1, "foo", "bar");
          refute.called(spy2);
        });
      });
    },

    "publish after called .off": function () {
      var foo = this.spy();
      var g1 = Gadget.create({
        "hub/foo": function () {
          foo();
        }
      });
      return start.call(g1).then(function () {
        g1.off("hub/foo");
        return emitter.emit("foo").then(function () {
          refute.called(foo);
        });
      });
    },

    "on/off/emit": {
      "emit to a topic that no handler is listening": function () {
        var g1 = new Gadget();

        return g1.emit.apply(g1, TEST_ARGS).then(function () {
          assert(true);
        });
      },

      "without exception": function () {
        var g1 = new Gadget();

        g1.on(TOPIC, function () {
          allSame(arguments, TEST_ARGS);
        });

        return g1.emit.apply(g1, APPLY_ARGS);
      },

      "on multiple instance should not interfere with each other": function () {
        var g1 = new Gadget();
        var g2 = new Gadget();

        g1.on(TOPIC, function () {
          allSame(arguments, TEST_ARGS);
        });
        g2.on(TOPIC, function () {
          assert(false);
        });

        return g1.emit.apply(g1, APPLY_ARGS);
      },

      "on() multiple times and the handler received in order": function () {
        var g1 = new Gadget();
        var g2 = new Gadget();

        var spy = this.spy();

        g1.on(TOPIC, spy);
        g1.on(TOPIC, function () {
          assert.called(spy);
          allSame(arguments, TEST_ARGS);
        });
        g2.on(TOPIC, function () {
          assert(false);
        });

        return g1.emit.apply(g1, APPLY_ARGS);
      }
    }
  });
});
