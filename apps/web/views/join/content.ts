// Copy for /join/. Answers come from the newsroom (October 2026); the equipment
// answer also draws on the Staff Device & Technology Policy. Keep answers plain
// text: they are repeated word for word in the page's FAQPage structured data.

export const CONTACT_EMAIL = "gibson@weeklywildcat.com";

export const LEARNING = [
  "Interviewing people and asking better questions",
  "Writing clearly, and revising when an editor asks",
  "Working to a deadline",
  "Checking names, facts and context before publication",
  "Using photographs and other people's words responsibly",
  "Building confidence with real published work"
] as const;

export const FAQ = [
  {
    question: "Who can join?",
    answer:
      "Any student at Ninety Six High School. There is no tryout, and you do not need to have written, photographed or designed anything before."
  },
  {
    question: "Is the Weekly Wildcat an official school activity?",
    answer: "Yes, it is. No parent needs to sign anything."
  },
  {
    question: "Do I need experience?",
    answer:
      "No. Good staff members are curious, reliable, willing to listen and open to revision. If you care about the school and want to learn, there is a place for you."
  },
  {
    question: "How do I sign up?",
    answer: `Talk to Mr. Mackin or email ${CONTACT_EMAIL}. If you are not sure what you want to do yet, that is fine. We can help you find a role.`
  },
  {
    question: "When can I join?",
    answer: "Any time of year. There is no application deadline."
  },
  {
    question: "How much time does it take?",
    answer:
      "Meetings are flexible and hybrid, both in person and online. You can start with a small piece of work and take on more as you get comfortable."
  },
  {
    question: "Can I join if I am busy with other activities?",
    answer: "Yes. We are very flexible."
  },
  {
    question: "Do I have to go to games and events?",
    answer: "Only if you want to cover them."
  },
  {
    question: "Can I pitch my own stories?",
    answer: "Yes. From your first week you can pitch your own ideas or take an assignment from an editor."
  },
  {
    question: "Can I write about anything I want?",
    answer: "Yes, as long as it stays within the general discretion of the editors."
  },
  {
    question: "Can I contribute without joining the staff?",
    answer:
      "Yes. We welcome letters and tips, though we cannot guarantee they will be published. We can also work with you on specific projects."
  },
  {
    question: "Will someone edit my work?",
    answer:
      "Yes. Editors read drafts, check details with you and help with headlines and photos before a story runs."
  },
  {
    question: "Do I have to write?",
    answer:
      "No. The staff also needs photographers, video makers, designers, illustrators, social media contributors and students who help run the website."
  },
  {
    question: "Can I use my school Chromebook?",
    answer:
      "No. District restrictions do not let you add your @weeklywildcat.com Google Workspace account to a school Chromebook, so you will not be able to reach our WordPress, shared drive or any documents, and you cannot do newspaper work on one. We also typically ask that Chromebooks not be used for interviews, since recordings and notes have been lost on them, and we would suggest not relying on one to research your stories. An iPad, MacBook or other personal laptop works much better. If you do not have one, we will work with you."
  },
  {
    question: "Do I need my own camera?",
    answer: "No. You can use your own equipment for photos and video, or borrow equipment from the newsroom."
  },
  {
    question: "What accounts will I get?",
    answer:
      "You will get a @weeklywildcat.com Google Workspace account. It lets you log in to our WordPress, where stories are written and edited."
  },
  {
    question: "Can I stay on the staff and become an editor?",
    answer: "Yes. Editors are chosen from the staff."
  },
  {
    question: "Will I have an author profile?",
    answer: "Yes. You will have an author profile on the site."
  },
  {
    question: "What do I get out of it?",
    answer:
      "Your work is published with your name on it and a credit on every photograph, so you build a portfolio of real clips. Joining is informal and does not come with course credit."
  },
  {
    question: "Who supervises the staff?",
    answer: "Mr. Mackin is our faculty adviser."
  },
  {
    question: "Who can I ask if I have more questions?",
    answer: `Email ${CONTACT_EMAIL} or talk to Mr. Mackin. Parents are welcome to ask too.`
  }
] as const;
