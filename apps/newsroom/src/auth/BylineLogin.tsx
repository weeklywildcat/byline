/// <reference types="next/image-types/global" />

import { after } from "next/server";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import logo from "../../../web/public/brand/weekly-wildcat-wide-logo.svg";
import { requestUser } from "../access/user";
import "../ui/login.css";
import { GOOGLE_START, googleConfig, newsroomReturnTo } from "./config";
import { LoginForm } from "./LoginForm";
import { loginPhoto } from "./unsplash";

export function BylineLogin({ initPageResult: { req }, searchParams }: AdminViewServerProps) {
  const { payload } = req;
  const { admin, routes } = payload.config;
  const returnTo = newsroomReturnTo(searchParams?.redirect, routes.admin);
  if (requestUser(req)) redirect(returnTo);

  const google = googleConfig(routes.api);
  const failed = searchParams?.google === "failed";
  const photo = loginPhoto(after);
  return (
    <main className="byline-ui-root">
      <div className="byline-login">
        {photo && <img className="byline-login-photo" src={photo.image} alt="" referrerPolicy="no-referrer" />}
        <div className="byline-login-shade" aria-hidden="true" />
        <section className="byline-login-card" aria-labelledby="byline-login-title">
          <img className="byline-login-logo" src={logo.src} alt="Weekly Wildcat" />
          <h1 id="byline-login-title">Sign in to Byline</h1>
          <LoginForm
            key={failed ? "google-failed" : "login"}
            google={google && {
              href: `${routes.api}${GOOGLE_START}?${new URLSearchParams({ returnTo })}`,
              domain: google.hostedDomain,
            }}
            googleFailed={failed}
            endpoint={`${routes.api}/${admin.user}/login`}
            returnTo={returnTo}
            forgotHref={payload.email.name === "console" ? null : `${routes.admin}${admin.routes.forgot}`}
          />
        </section>
        {photo && <p className="byline-login-credit">
          Photo by <a href={photo.photographer} target="_blank" rel="noopener noreferrer">{photo.name}</a>
          {" on "}<a href={photo.photo} target="_blank" rel="noopener noreferrer">Unsplash</a>
        </p>}
      </div>
    </main>
  );
}
