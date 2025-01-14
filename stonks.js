/** @param {NS} ns */
export async function main(ns) {
    // Configuration
    const FORECAST_THRESHOLD = 0.6; // Buy when forecast > 60%
    const PROFIT_THRESHOLD = 1.01; // Sell when price is 1% higher than purchase
    const MINIMUM_CASH = 10000000; // Keep reserve
    
    // Store our positions
    let positions = new Map();
    
    while (true) {
        const symbols = ns.stock.getSymbols();
        
        // Check existing positions for sell opportunities
        for (let [symbol, data] of positions) {
            const currentPrice = ns.stock.getPrice(symbol);
            const position = ns.stock.getPosition(symbol);
            
            // If we've hit our profit target, sell
            if (currentPrice >= data.purchasePrice * PROFIT_THRESHOLD) {
                const profit = position[0] * (currentPrice - data.purchasePrice);
                ns.stock.sellStock(symbol, position[0]);
                ns.print(`SOLD ${symbol} for ${ns.formatNumber(profit)} profit`);
                positions.delete(symbol);
            }
        }
        
        // Look for buying opportunities
        for (const symbol of symbols) {
            // Skip if we already have a position
            if (positions.has(symbol)) continue;
            
            const forecast = ns.stock.getForecast(symbol);
            const price = ns.stock.getPrice(symbol);
            const maxShares = ns.stock.getMaxShares(symbol);
            const availableMoney = ns.getServerMoneyAvailable("home") - MINIMUM_CASH;
            
            // Only buy if forecast is good
            if (forecast > FORECAST_THRESHOLD) {
                // Calculate how many shares we can afford
                const sharesToBuy = Math.min(
                    maxShares,
                    Math.floor(availableMoney / price)
                );
                
                if (sharesToBuy > 0) {
                    const bought = ns.stock.buyStock(symbol, sharesToBuy);
                    if (bought > 0) {
                        positions.set(symbol, {
                            purchasePrice: price,
                            shares: sharesToBuy
                        });
                        ns.print(`BOUGHT ${sharesToBuy} shares of ${symbol} at ${ns.formatNumber(price)}`);
                    }
                }
            }
        }
        
        // Status update
        let totalValue = 0;
        for (let [symbol, data] of positions) {
            const position = ns.stock.getPosition(symbol);
            const currentValue = position[0] * ns.stock.getPrice(symbol);
            totalValue += currentValue;
        }
        ns.print(`Current portfolio value: ${ns.formatNumber(totalValue)}`);
        
        await ns.sleep(6000); // Wait 6 seconds before next cycle
    }
}