import Campaigns from "../components/Campaigns";
import CampaignLifecycleControls from "../components/CampaignLifecycleControls";

export default function Page() {
  return <>
    <Campaigns mode="campaigns" />
    <CampaignLifecycleControls />
  </>;
}
