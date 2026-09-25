import { notFound } from "next/navigation";
import { getQuizForPlay } from "@/lib/quizzes";
import { QuizPlayer } from "./QuizPlayer";

export default async function PlayQuizPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const quiz = await getQuizForPlay(slug);
  if (!quiz || quiz.questions.length === 0) notFound();

  return <QuizPlayer slug={slug} questions={quiz.questions} />;
}
