import Campaigns from "../components/Campaigns";
import SoldPaintingsCounter from "../components/SoldPaintingsCounter";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="inventoryPage">
      <Campaigns mode="inventory" />
      <SoldPaintingsCounter />
      <div className="inventoryMobileFloatSpace" aria-hidden="true" />
      <style>{`
        .inventoryMobileFloatSpace { display: none; }
        @media (max-width: 620px) {
          .inventoryMobileFloatSpace {
            display: block;
            height: 17rem;
            pointer-events: none;
          }
        }
      `}</style>
    </div>
  );
}
