import test from 'ava';
import loggerSpec from '.';

test('creates a module tag', t => {
  const expected = '{\"name\":\"foo.bar\",\"color\":{\"server\":135,\"client\":\"rgb(127,42,212)\"}}';

  const file = 'foo/bar';
  const config = {};
  const actual = loggerSpec.bind({file, config})(file);

  t.is(expected, actual);
});

test('trims prefix from module tag name', t => {
  const expected = '{\"name\":\"quux\",\"color\":{\"server\":143,\"client\":\"rgb(127,127,42)\"}}';

  const file = 'baz/quux';
  const config = { trim: 'baz.' };
  const actual = loggerSpec.bind({file, config})(file);

  t.is(expected, actual);
});

test('adds labels', t => {
  const expected = '{\"label\":\"foo\",\"name\":\"has.label.foo\",\"color\":{\"server\":87,\"client\":\"rgb(42,212,212)\"}}';

  const file = 'has/label';
  const config = {};
  const actual = loggerSpec.bind({file, config})(file, '({label: "foo"})');

  t.is(expected, actual);
});
