// lib/utils/decimal.dart

/// A lightweight, self-contained, arbitrary-precision decimal number representation
/// that uses BigInt internally to prevent floating-point math issues.
class Decimal implements Comparable<Decimal> {
  final BigInt value;
  static const int scale = 8;
  static final BigInt scaleFactor = BigInt.from(100000000); // 10^8

  Decimal(this.value);

  factory Decimal.zero() => Decimal(BigInt.zero);

  factory Decimal.one() => Decimal(scaleFactor);

  factory Decimal.parse(String input) {
    final cleaned = input.trim();
    if (cleaned.isEmpty) {
      throw FormatException("Empty decimal string");
    }

    final isNegative = cleaned.startsWith('-');
    final absolute = isNegative ? cleaned.substring(1) : cleaned;

    final parts = absolute.split('.');
    if (parts.length > 2) {
      throw FormatException("Invalid decimal format: $input");
    }

    final integerPart = parts[0];
    final fractionalPart = parts.length == 2 ? parts[1] : '';

    final parsedInteger = BigInt.parse(integerPart.isEmpty ? '0' : integerPart);
    
    // Scale fraction to 8 digits
    final normalizedFraction = fractionalPart.padRight(scale, '0').substring(0, scale);
    final parsedFraction = BigInt.parse(normalizedFraction);

    final totalAbs = parsedInteger * scaleFactor + parsedFraction;
    final finalValue = isNegative ? -totalAbs : totalAbs;

    return Decimal(finalValue);
  }

  Decimal operator +(Decimal other) {
    return Decimal(value + other.value);
  }

  Decimal operator -(Decimal other) {
    return Decimal(value - other.value);
  }

  Decimal operator *(Decimal other) {
    final product = value * other.value;
    final result = product ~/ scaleFactor;
    return Decimal(result);
  }

  Decimal operator /(Decimal other) {
    if (other.value == BigInt.zero) {
      throw ArgumentError("Division by zero");
    }
    final dividend = value * scaleFactor;
    final result = dividend ~/ other.value;
    return Decimal(result);
  }

  bool operator >(Decimal other) => value > other.value;
  bool operator <(Decimal other) => value < other.value;
  bool operator >=(Decimal other) => value >= other.value;
  bool operator <=(Decimal other) => value <= other.value;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Decimal && runtimeType == other.runtimeType && value == other.value;

  @override
  int get hashCode => value.hashCode;

  @override
  int compareTo(Decimal other) {
    return value.compareTo(other.value);
  }

  @override
  String toString() {
    final isNegative = value < BigInt.zero;
    final absoluteValue = value.abs();

    final integerPart = absoluteValue ~/ scaleFactor;
    final fractionalPart = absoluteValue % scaleFactor;

    final fractionalStr = fractionalPart.toString().padLeft(scale, '0');
    
    // Strip trailing zeros from fractional part
    var cleanedFractional = fractionalStr;
    while (cleanedFractional.length > 1 && cleanedFractional.endsWith('0')) {
      cleanedFractional = cleanedFractional.substring(0, cleanedFractional.length - 1);
    }
    
    if (cleanedFractional == '0') {
      return '${isNegative ? "-" : ""}$integerPart';
    }

    return '${isNegative ? "-" : ""}$integerPart.$cleanedFractional';
  }
}
