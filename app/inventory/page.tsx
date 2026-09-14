import Campaigns from "../components/Campaigns";
import SoldPaintingsCounter from "../components/SoldPaintingsCounter";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="inventoryPage">
      <Campaigns mode="inventory" />
      <SoldPaintingsCounter />
      <div className="inventoryMobileFloatSpace" aria-hidden="true" />
    </div>
  );
}
