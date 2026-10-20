import { useTranslation } from "react-i18next";

export default function App() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t("appName")}</h1>
      <p>{t("tagline")}</p>
      <small>{t("notAffiliated")}</small>
    </main>
  );
}
