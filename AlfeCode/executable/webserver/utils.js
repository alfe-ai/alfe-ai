const formatTokenLimit = (value) => {
    const numericValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return "N/A";
    }

    const thinSpace = "\u202F";
    const formatWithUnit = (unitValue, unitLabel) => {
        const rounded = Number.isInteger(unitValue)
            ? unitValue.toString()
            : unitValue.toFixed(1).replace(/\.0$/, "");
        return `${rounded}${thinSpace}${unitLabel}`;
    };

    if (numericValue >= 1_000_000) {
        return formatWithUnit(numericValue / 1_000_000, "M");
    }
    if (numericValue >= 1_000) {
        return formatWithUnit(numericValue / 1_000, "K");
    }
    return `${numericValue}`;
};

module.exports = {
    formatTokenLimit,
};
