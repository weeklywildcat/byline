"use client";

import { FormEvent, useState } from "react";
import { ReaderFeedbackView } from "@byline/ui";

type ReaderFeedbackFormProps = {
  postId: number;
  articleTitle: string;
  articleUrl: string;
  endpointCandidates: string[];
};

type SubmissionState = "idle" | "submitting" | "success" | "error";

const REQUEST_TIMEOUT_MS = 8_000;

export function ReaderFeedbackForm({
  postId,
  articleTitle,
  articleUrl,
  endpointCandidates
}: ReaderFeedbackFormProps) {
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [message, setMessage] = useState("");
  const [feedbackType, setFeedbackType] = useState("correction");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      setSubmissionState("error");
      setErrorMessage("Add a message before sending.");
      return;
    }

    if (endpointCandidates.length === 0) {
      setSubmissionState("error");
      setErrorMessage("The feedback form is temporarily unavailable. Please use the newsroom contact page.");
      return;
    }

    setSubmissionState("submitting");
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    const honeypot = String(formData.get("website") ?? "").trim();
    let submitted = false;

    for (const endpoint of endpointCandidates) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            postId,
            storyId: postId,
            postTitle: articleTitle,
            postUrl: articleUrl,
            type: feedbackType,
            message: trimmedMessage,
            name: name.trim(),
            email: email.trim(),
            website: honeypot
          }),
          signal: controller.signal
        });

        if (response.ok) {
          submitted = true;
          break;
        }

        // A missing canonical route can use the legacy namespace. Do not
        // retry validation, rate-limit, or server failures because a retry
        // could create duplicate feedback records.
        if (response.status !== 404) {
          break;
        }
      } catch {
        // A network/CORS failure is expected to be recoverable at article
        // render time. The form reports it without taking down the article.
        break;
      } finally {
        window.clearTimeout(timeout);
      }
    }

    if (submitted) {
      setSubmissionState("success");
      setMessage("");
      setName("");
      setEmail("");
      return;
    }

    setSubmissionState("error");
    setErrorMessage("We couldn't send that note right now. Please try again or contact the newsroom.");
  }

  return (
    <ReaderFeedbackView
      type={feedbackType}
      message={message}
      name={name}
      email={email}
      submitting={submissionState === "submitting"}
      status={<>{submissionState === "success" ? "Thanks — your feedback was sent to the newsroom." : null}{submissionState === "error" ? errorMessage : null}</>}
      onType={setFeedbackType}
      onMessage={setMessage}
      onName={setName}
      onEmail={setEmail}
      onSubmit={submitFeedback}
    />
  );
}
