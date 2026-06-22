const MONEY_SCALE = 100;

function toCents(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error('Amount must be a valid number');
  }
  return Math.round(numberValue * MONEY_SCALE);
}

function fromCents(cents) {
  return (cents / MONEY_SCALE).toFixed(2);
}

function addMoney(current, delta) {
  return fromCents(toCents(current || '0') + toCents(delta));
}

function subtractMoney(current, delta) {
  return fromCents(toCents(current || '0') - toCents(delta));
}

module.exports = { toCents, fromCents, addMoney, subtractMoney };
