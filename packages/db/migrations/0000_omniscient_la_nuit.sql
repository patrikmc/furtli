CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"choice_id" uuid,
	"is_correct" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"score" integer NOT NULL,
	"total_questions" integer NOT NULL,
	"score_percentage" double precision NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"content_key" text,
	"text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"content_key" text,
	"prompt" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"thumbnail_url" text,
	"cover_image_url" text,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_choice_id_choices_id_fk" FOREIGN KEY ("choice_id") REFERENCES "public"."choices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choices" ADD CONSTRAINT "choices_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answers_attempt_id_idx" ON "answers" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "attempts_quiz_user_idx" ON "attempts" USING btree ("quiz_id","clerk_user_id");--> statement-breakpoint
CREATE INDEX "attempts_user_idx" ON "attempts" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "attempts_quiz_completed_idx" ON "attempts" USING btree ("quiz_id","completed_at");--> statement-breakpoint
CREATE INDEX "choices_question_id_idx" ON "choices" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "choices_question_content_key_idx" ON "choices" USING btree ("question_id","content_key");--> statement-breakpoint
CREATE INDEX "questions_quiz_id_idx" ON "questions" USING btree ("quiz_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_quiz_content_key_idx" ON "questions" USING btree ("quiz_id","content_key");--> statement-breakpoint
CREATE UNIQUE INDEX "quizzes_slug_idx" ON "quizzes" USING btree ("slug");