const token = process.env.PRINTFUL_PRIVATE_TOKEN?.trim();
if (!token) throw new Error("PRINTFUL_PRIVATE_TOKEN missing");
const response = await fetch("https://api.printful.com/products/1", {
  headers: { Authorization: `Bearer ${token}`, "X-PF-Language": "en_US" },
  cache: "no-store",
});
if (!response.ok) throw new Error(`Printful catalog failed: ${response.status}`);
const data = await response.json();
const variants = (data?.result?.variants ?? []).filter((v) => ["8″×10″","11″×14″"].includes(v.size));
console.log("PRINTFUL_PRODUCT_1_VARIANTS", JSON.stringify(variants.map(v => ({
  id:v.id,name:v.name,size:v.size,price:v.price,currency:v.currency
}))));
