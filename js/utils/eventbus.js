export const EventBus = (() => {
  const ouvintes = {};
  return {
    on: (evento, callback) => (ouvintes[evento] ??= []).push(callback),
    emit: (evento, payload) => (ouvintes[evento] || []).forEach(cb => cb(payload))
  };
})();