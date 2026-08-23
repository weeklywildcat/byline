const commonQuestions = [
  {
    question: "I’ve never written for a newspaper before. Can I still join?",
    answer:
      "Yes. Most people do not start with journalism experience. We can help with interviewing, writing, photography, editing and the other parts of the job as you learn them."
  },
  {
    question: "Do I have to write articles?",
    answer: "No. There are plenty of ways to contribute without regularly writing stories."
  },
  {
    question: "Do I need my own computer?",
    answer: "No. You can use your school Chromebook, use your own device or borrow one of our loaner laptops."
  },
  {
    question: "Are meetings in person?",
    answer: "Most regular meetings are virtual. We also work together in person some days."
  },
  {
    question: "How much time does it take?",
    answer:
      "It depends on what you choose to do. We do expect you to finish what you start, and most of our staff spend a few hours a week contributing."
  },
  {
    question: "Can I join after the school year has already started?",
    answer:
      "Yes. There is no point in the year when you have missed your chance to get involved. You can also take a break from the paper at any time, for however long you need."
  }
];

export function JoinPageContent() {
  return (
    <article className="join-page">
      <header className="join-hero">
        <div className="join-hero-copy">
          <p className="join-kicker">Come as you are</p>
          <h1>
            <span>Join the</span>
            <span>Weekly Wildcat</span>
          </h1>
          <div className="join-hero-intro">
            <p>
              Our staff includes people who like writing, photography, sports, design, social media and working on the
              website. Some people come in knowing exactly what they want to cover. Others join because they are
              curious and figure it out from there.
            </p>
            <p>If you care about what happens at school and want to help tell those stories, there is probably something here for you.</p>
          </div>
          <div className="join-hero-actions">
            <a className="join-button" href="#interested">
              Join the staff
            </a>
            <a className="join-text-link" href="#what-to-expect">
              See what staff life is like ↓
            </a>
          </div>
        </div>

        <figure className="join-hero-photo">
          <img
            src="/join/sideline-photographer.jpg"
            width="1800"
            height="1200"
            alt="A Weekly Wildcat student photographer smiling with her camera in the school gym"
          />
          <span className="join-photo-stamp" aria-hidden="true">
            100% student-run
          </span>
          <figcaption>There is more than one way to tell a story.</figcaption>
        </figure>
      </header>

      <div className="join-motion-strip" aria-label="Write, shoot, design, report, build and pitch with the Weekly Wildcat">
        <div className="join-motion-track" aria-hidden="true">
          <span>Write it</span><i>✦</i><span>Shoot it</span><i>✦</i><span>Design it</span><i>✦</i><span>Report it</span><i>✦</i><span>Build it</span><i>✦</i><span>Pitch it</span><i>✦</i>
          <span>Write it</span><i>✦</i><span>Shoot it</span><i>✦</i><span>Design it</span><i>✦</i><span>Report it</span><i>✦</i><span>Build it</span><i>✦</i><span>Pitch it</span><i>✦</i>
        </div>
      </div>

      <div className="join-ideas-over-experience" aria-label="Ideas over experience">
        <strong>Ideas</strong>
        <span>over</span>
        <strong>Experience</strong>
      </div>

      <section className="join-culture" aria-labelledby="join-culture-heading">
        <div className="join-section-label">How it feels</div>
        <div className="join-culture-copy">
          <h2 id="join-culture-heading">Our culture</h2>
          <p className="join-big-copy">The Weekly Wildcat is completely student-run.</p>
          <p>
            We encourage our staff to bring up story ideas, try things and have some ownership over what they work on.
            An idea does not have to come from an editor before someone can pursue it.
          </p>
          <blockquote>“Some of our best stories start with somebody noticing something at school and saying, ‘We should cover that.’”</blockquote>
          <p>
            Nobody is expected to walk in already knowing how to interview someone, photograph a football game or
            write a perfect article. Editors are here to edit, answer questions and help. You are going to make
            mistakes while you learn. We all do.
          </p>
          <p>
            We take the work seriously without trying to make the newsroom overly serious. Meetings are a place to
            figure out what needs to get done, talk through ideas and catch up with everyone.
          </p>
        </div>
        <figure className="join-culture-photo">
          <img
            src="/join/newsroom-meeting.jpg"
            width="1800"
            height="1350"
            loading="lazy"
            alt="Weekly Wildcat staff members sitting together during an informal classroom meeting"
          />
          <figcaption>A regular newsroom meeting: ideas, assignments and plenty of catching up.</figcaption>
        </figure>
      </section>

      <section className="join-roles" aria-labelledby="join-roles-heading">
        <figure className="join-roles-photo">
          <img
            src="/join/remote-interview.jpg"
            width="1200"
            height="1800"
            loading="lazy"
            alt="A laptop being used for a remote interview from the school gym"
          />
        </figure>
        <div className="join-roles-copy">
          <p className="join-kicker">Find your thing</p>
          <h2 id="join-roles-heading">You don’t have to be a writer</h2>
          <p>
            Writing and reporting are a big part of what we do, but they are not the whole newspaper. You might spend
            Friday night taking photos from the sideline instead of writing the game story. You might make graphics
            for Instagram, help edit someone else&apos;s article, cover student events or work on the website.
          </p>
          <p>
            Your role is not fixed. We are incredibly flexible and encourage you to explore different areas. If you
            are interested in journalism but have no idea where you would fit, that is completely normal. Come in and
            try a few things.
          </p>
          <ul className="join-role-list" aria-label="Ways to contribute">
            <li><span>01</span><strong>Reporting</strong><em>Interview people and write stories.</em></li>
            <li><span>02</span><strong>Photography</strong><em>Take pictures at games and events.</em></li>
            <li><span>03</span><strong>Sports</strong><em>Cover games, teams and athletes.</em></li>
            <li><span>04</span><strong>Design</strong><em>Make graphics and lay things out.</em></li>
            <li><span>05</span><strong>Social</strong><em>Help run Instagram and post updates.</em></li>
            <li><span>06</span><strong>Web</strong><em>Work on the site and fix what breaks.</em></li>
          </ul>
          <p className="join-hand-note">You can try more than one.</p>
        </div>
      </section>

      <section className="join-expectations" id="what-to-expect" aria-labelledby="join-staff-life-heading">
        <div className="join-staff-life">
          <p className="join-kicker">What to expect</p>
          <h2 id="join-staff-life-heading">Staff life</h2>
          <p>Most of our regular staff communication happens online. We work around sports and other clubs.</p>
          <p>
            Stories come from a mix of planned coverage and staff ideas. Sometimes there is an obvious assignment,
            like a football game, school event or election. Other times somebody finds something worth asking about
            and pitches it.
          </p>
          <p>
            Once you take a story, you are responsible for keeping up with it. That could mean arranging an interview,
            going to an event, taking photos, doing research or simply making sure the story is finished when you said
            it would be. Editors will work with you throughout that process.
          </p>
          <figure>
            <img
              src="/join/reporting-outside.jpg"
              width="1800"
              height="1350"
              loading="lazy"
              alt="A Weekly Wildcat staff member working on a laptop outside"
            />
          </figure>
        </div>

        <aside className="join-expectations-note" aria-labelledby="join-expectations-heading">
          <h2 id="join-expectations-heading">
            <span>Be curious.</span>
            <span>Be accurate.</span>
            <span>Be someone people can count on.</span>
          </h2>
          <p>
            You do not have to work on the paper every week. If you take an assignment, finish it or tell an editor
            early if you cannot.
          </p>
          <p>
            If you get stuck, ask. If an interview falls through or the story is harder than you expected, tell
            someone. That happens.
          </p>
          <p>
            Check names, dates and quotes before you turn anything in. Do not report rumors. It is better to post a
            story late than post it wrong.
          </p>
          <p>
            You may see drafts, notes or photos before they are published. Do not share them outside the staff. Follow
            school rules when you are covering something.
          </p>
        </aside>
      </section>

      <section className="join-contact-sheet" aria-labelledby="join-contact-sheet-heading">
        <header>
          <p className="join-kicker">A regular meeting</p>
          <h2 id="join-contact-sheet-heading">Most of the time, it looks like this.</h2>
          <p>We sit around, talk about what is going on at school and decide what each person can work on.</p>
        </header>
        <div className="join-contact-photos">
          <figure>
            <img src="/join/newsroom-meeting.jpg" width="1800" height="1350" loading="lazy" alt="Weekly Wildcat staff talking during a classroom meeting" />
            <figcaption>01 / Show up</figcaption>
          </figure>
          <figure>
            <img src="/join/sideline-photographer.jpg" width="1800" height="1200" loading="lazy" alt="A student photographer holding her camera in the gym" />
            <figcaption>02 / Get the shot</figcaption>
          </figure>
          <figure>
            <img src="/join/making-press-passes.jpg" width="1800" height="1350" loading="lazy" alt="Weekly Wildcat press passes being designed on a laptop" />
            <figcaption>03 / Make the thing</figcaption>
          </figure>
        </div>
        <div className="join-contact-pull" aria-hidden="true">
          <span>Nobody starts out</span><b>knowing</b><span>how.</span>
        </div>
      </section>

      <section className="join-equipment" aria-labelledby="join-equipment-heading">
        <div className="join-equipment-copy">
          <p className="join-kicker">No shopping list</p>
          <h2 id="join-equipment-heading">What you need</h2>
          <p className="join-big-copy">You do not need to buy a laptop, camera or other equipment to join.</p>
          <p>
            During the school day, staff can use their school-issued Chromebooks. Many staff members also use their
            own personal devices, and we support Linux and macOS. We keep a limited number of loaner laptops for people
            who need a computer for newspaper work outside of school.
          </p>
          <p>
            Staff members receive a Weekly Wildcat Google Workspace account along with access to the services we use
            for publishing and communication, including WordPress. If you join our technical development team, you
            will also need a GitHub account to contribute.
          </p>
        </div>
        <figure className="join-equipment-photo">
          <img
            src="/join/making-press-passes.jpg"
            width="1800"
            height="1350"
            loading="lazy"
            alt="A laptop on the floor displaying Weekly Wildcat media pass designs in progress"
          />
          <figcaption>The work is real. The setup does not have to be fancy.</figcaption>
        </figure>
      </section>

      <section className="join-faq" aria-labelledby="join-faq-heading">
        <div className="join-faq-heading">
          <p className="join-kicker">Before you ask</p>
          <h2 id="join-faq-heading">A few common questions</h2>
        </div>
        <div className="join-faq-list">
          {commonQuestions.map((item, index) => (
            <details key={item.question} open={index === 0}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="join-final-cta" id="interested" aria-labelledby="join-interested-heading">
        <div className="join-cta-scribble" aria-hidden="true">You belong here →</div>
        <p>Interested?</p>
        <h2 id="join-interested-heading">Tell us a little about yourself and what sounds interesting to you.</h2>
        <a className="join-button join-button-light" href="/contact/">
          Join the Weekly Wildcat
        </a>
        <span>No experience required. Really.</span>
      </section>
    </article>
  );
}
