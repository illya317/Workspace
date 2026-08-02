import ModuleHomePage from "@workspace/platform/server/module-home-page";

export default async function SettingsPage() {
  return ModuleHomePage({ moduleKey: "settings" });
}
