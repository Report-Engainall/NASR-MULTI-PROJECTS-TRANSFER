import { createFileRoute } from "@tanstack/react-router";
import { StorefrontCategoryLandingPage } from "@/components/StorefrontCategoryLandingPage";

export const Route = createFileRoute("/category/$slug/subcategory/$subcategorySlug")({
  head: ({ params }) => ({ meta: [{ title: "التصنيف الفرعي | متجر الأغبري", description: "أصناف منشورة ضمن التصنيف الفرعي " + params.subcategorySlug }] }),
  component: SubcategoryPage,
});

function SubcategoryPage() {
  const { slug, subcategorySlug } = Route.useParams();
  return <StorefrontCategoryLandingPage categorySlug={slug} subcategorySlug={subcategorySlug} />;
}
