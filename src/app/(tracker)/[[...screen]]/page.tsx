import { notFound } from "next/navigation";

export default async function TrackerPage({
  params,
}: {
  params: Promise<{ screen?: string[] }>;
}) {
  const { screen = [] } = await params;
  const path = screen.join("/");
  const uuid = "[0-9a-fA-F-]{36}";
  const meal = new RegExp(
    `^(meals|recipes)/(new|${uuid})(/(search|custom-food|food/[^/]+|entry/${uuid}))?$`,
  );
  const library = new RegExp(`^custom-foods(/(recipes|new|${uuid}))?$`);
  if (path && !meal.test(path) && !library.test(path)) notFound();
  return null;
}
