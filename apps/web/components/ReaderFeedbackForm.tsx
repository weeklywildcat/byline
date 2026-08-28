"use client";

import { FormEvent, useState } from "react";

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
    <section className="reader-feedback" aria-labelledby="reader-feedback-heading">
      <details>
        <summary id="reader-feedback-heading">Spot an error or have a note? Send us feedback</summary>
        <div className="reader-feedback-body">
          <p>Help us keep this story accurate. We review every submission.</p>
          <form onSubmit={submitFeedback}>
            <label>
              What would you like to share?
              <select value={feedbackType} onChange={(event) => setFeedbackType(event.target.value)} disabled={submissionState === "submitting"}>
                <option value="correction">Correction</option>
                <option value="tip">Tip</option>
                <option value="general">General feedback</option>
              </select>
            </label>
            <label>
              Message
              <textarea
                required
                maxLength={5000}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={submissionState === "submitting"}
                rows={5}
              />
            </label>
            <div className="reader-feedback-fields">
              <label>
                Name <span>(optional)</span>
                <input type="text" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={submissionState === "submitting"} />
              </label>
              <label>
                Email <span>(optional)</span>
                <input type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={submissionState === "submitting"} />
              </label>
            </div>
            <div className="reader-feedback-honeypot" aria-hidden="true">
              <label>
                Leave this field empty
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <button type="submit" disabled={submissionState === "submitting"}>
              {submissionState === "submitting" ? "Sending…" : "Send feedback"}
            </button>
            <p className="reader-feedback-status" role="status" aria-live="polite">
              {submissionState === "success" ? "Thanks — your feedback was sent to the newsroom." : null}
              {submissionState === "error" ? errorMessage : null}
            </p>
          </form>
        </div>
      </details>
    </section>
  );
}
