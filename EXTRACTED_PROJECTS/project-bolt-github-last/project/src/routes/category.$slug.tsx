import { createFileRoute } from "@tanstack/react-router";
import { StorefrontCategoryLandingPage } from "@/components/StorefrontCategoryLandingPage";

export const Route = createFileRoute("/category/$slug")({
  head: ({ params }) => ({ meta: [{ title: "التصنيف | متجر الأغبري", description: "أصناف منشورة ضمن التصنيف " + params.slug }] }),
  component: CategorySlugPage,
});

function CategorySlugPage() {
  const { slug } = Route.useParams();
  return <StorefrontCategoryLandingPage categorySlug={slug} />;
}
