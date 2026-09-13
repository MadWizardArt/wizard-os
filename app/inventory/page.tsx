import Campaigns from "../components/Campaigns";
import SoldPaintingsCounter from "../components/SoldPaintingsCounter";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <Campaigns mode="inventory" />
      <SoldPaintingsCounter />
    </>
  );
}
