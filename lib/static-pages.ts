export type StaticPageAction = {
  label: string;
  href: string;
};

export type StaticPageSection = {
  title: string;
  body: string | string[];
  tone?: "featured";
  actions?: StaticPageAction[];
};

export type StaticPage = {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  sections: StaticPageSection[];
  actions?: StaticPageAction[];
};

export const STATIC_PAGES: StaticPage[] = [
  {
    slug: "about",
    title: "About Us",
    eyebrow: "Weekly Wildcat",
    description:
      "Weekly Wildcat is Ninety Six High School's student newspaper, created to tell the stories of our school with care, curiosity and a local voice.",
    sections: [
      {
        title: "What We Do",
        body:
          "We cover the people, events, teams, clubs, decisions and everyday moments that shape life at Ninety Six High School. Some stories are big campus updates. Others are smaller pieces that help readers understand what students are doing, building, debating and celebrating."
      },
      {
        title: "A Student Newsroom",
        body:
          "Weekly Wildcat is written, photographed, edited and designed by students. The newsroom is a place to learn by doing: asking better questions, checking facts, revising drafts, meeting deadlines and paying attention to the community around us."
      },
      {
        title: "Our Standards",
        body:
          "We want our work to be fair, accurate and useful. That means listening closely, giving people a chance to respond, correcting mistakes when they happen and making sure opinion pieces are clearly presented as opinion."
      },
      {
        title: "Be Part of It",
        body:
          "Readers can help by sending story ideas, sharing photos, pointing us toward events or joining the staff. A stronger school newspaper starts with more people noticing what deserves to be covered."
      }
    ],
    actions: [
      { label: "Meet Our Writers", href: "/authors/" },
      { label: "Join the Staff", href: "/join/" }
    ]
  },
  {
    slug: "advertise",
    title: "Advertise with Us",
    eyebrow: "Partnerships",
    description:
      "Reach families, students, staff and local readers who care about Ninety Six High School and the community around it.",
    sections: [
      {
        title: "A Local Audience",
        body:
          "Weekly Wildcat is read by people who are already paying attention to school life: parents checking updates, students following campus news, alumni keeping up with Ninety Six, and community members who want to support local student work."
      },
      {
        title: "What Advertising Supports",
        body:
          "Advertising helps us keep building a better student newspaper. It supports reporting, photography, design tools, web costs and the everyday work that goes into publishing stories by and for students."
      },
      {
        title: "Let’s Talk",
        body:
          "If your business, organization or group is interested in advertising with Weekly Wildcat, reach out and tell us what you have in mind. We can talk through options that fit the publication and make sense for your audience."
      }
    ],
    actions: [{ label: "Contact Us", href: "/contact/" }]
  },
  {
    slug: "join",
    title: "Join Our Team",
    eyebrow: "Newsroom",
    description:
      "Weekly Wildcat is open to students who want to report, write, photograph, edit, design, make videos, cover sports or help tell the story of Ninety Six High School.",
    sections: [
      {
        title: "You Don’t Have to Be an Expert",
        body:
          "You do not need to show up as a perfect writer, photographer or designer. Good staff members are curious, reliable, willing to listen and open to revision. If you care about the school and want to learn, there is a place for you."
      },
      {
        title: "Ways to Help",
        body:
          "Students can report news, write features, cover games, take photos, make graphics, edit stories, create social videos, write opinion pieces, interview classmates or help run the website. You can start small and take on more as you get comfortable."
      },
      {
        title: "What You’ll Learn",
        body:
          "Staff members practice interviewing, writing clearly, working with deadlines, editing for accuracy, using photos responsibly and building confidence with real published work. The goal is not just to make a newspaper; it is to help students become sharper communicators."
      },
      {
        title: "How to Start",
        body:
          "Send us a note, talk to a current staff member or bring us a story idea. If you are not sure what you want to do yet, that is fine too. We can help you find a role that fits your interests."
      }
    ],
    actions: [{ label: "Get in Touch", href: "/contact/" }]
  },
  {
    slug: "leadership",
    title: "Leadership",
    eyebrow: "Newsroom",
    description:
      "Weekly Wildcat leadership helps guide the newsroom, support student contributors and keep the publication focused on fair, useful student journalism.",
    sections: [
      {
        title: "How Leadership Works",
        body:
          "Student leaders help decide what needs coverage, organize story assignments, review drafts and make sure work is ready for readers. Leadership is less about having the loudest voice and more about helping the newsroom do its best work."
      },
      {
        title: "What Editors Do",
        body:
          "Editors help writers sharpen ideas, strengthen reporting, check details and make stories easier to follow. They also help with headlines, photos, layout, publishing decisions and the many small choices that shape how a story appears."
      },
      {
        title: "Supporting New Voices",
        body:
          "A good student publication should make room for more than one kind of student. Weekly Wildcat leaders are expected to welcome new contributors, explain the process clearly and help students build confidence as they learn."
      },
      {
        title: "Accountability",
        body:
          "Leadership also means taking responsibility when something needs to be fixed. If a story has an error, misses important context or raises a concern, we want to hear about it and review it carefully."
      }
    ],
    actions: [
      { label: "Join the Staff", href: "/join/" },
      { label: "Contact Us", href: "/contact/" }
    ]
  },
  {
    slug: "diversity-inclusion",
    title: "Diversity & Inclusion",
    eyebrow: "Standards",
    description:
      "Weekly Wildcat believes every student deserves to see their school and community represented accurately, fairly and fully. We want our newsroom to include voices, experiences and stories that are often overlooked.",
    sections: [
      {
        title: "What This Means in Practice",
        body:
          "We will look beyond the easiest voices to quote and the most visible clubs, teams and leadership groups. That means seeking a range of perspectives, covering issues that affect different groups of students, avoiding stereotypes or tokenism, and making room for students whose stories are not always treated as front-page stories."
      },
      {
        title: "Accessibility",
        body:
          "Readers should be able to follow Weekly Wildcat without fighting the page. If something is hard to read, hard to navigate, missing useful context or not working well on your device, we want to hear about it so we can make the site better."
      },
      {
        title: "Help Us Do Better",
        body: [
          "Readers can suggest stories, flag coverage that felt inaccurate or exclusionary, request a correction, report an accessibility issue or share a concern without attaching their name.",
          "When you reach out, tell us what happened and how you would like your name handled. We will take the concern seriously, review it carefully and correct the record when needed."
        ],
        tone: "featured",
        actions: [{ label: "Share Feedback", href: "/contact/" }]
      },
      {
        title: "Join the Newsroom",
        body: [
          "Weekly Wildcat is open to students of any background or experience level. We need writers, photographers, designers, illustrators, video creators, social media contributors and students with story ideas.",
          "You do not have to arrive as an expert; you just have to be curious, fair and willing to learn."
        ],
        tone: "featured",
        actions: [{ label: "Join the Newsroom", href: "/join/" }]
      }
    ]
  },
  {
    slug: "image-license",
    title: "Image License",
    eyebrow: "Licensing",
    description:
      "Original Weekly Wildcat images are available under the Creative Commons Attribution 4.0 International license unless otherwise noted.",
    sections: [
      {
        title: "Default Image License",
        body:
          "Unless a caption, credit line or image detail page says otherwise, original photographs and images published by Weekly Wildcat are licensed under the Creative Commons Attribution 4.0 International license."
      },
      {
        title: "How to Credit Us",
        body:
          "When you reuse an image, include the credited creator when one is listed, name Weekly Wildcat, link back to the original story or image page when practical, and note if you changed the image."
      },
      {
        title: "What CC BY 4.0 Allows",
        body:
          "CC BY 4.0 allows others to share and adapt licensed material, including for commercial purposes, as long as they give appropriate credit, link to the license and indicate if changes were made.",
        actions: [{ label: "Read CC BY 4.0", href: "https://creativecommons.org/licenses/by/4.0/" }]
      },
      {
        title: "Exceptions",
        body:
          "Some images may come from outside sources, school partners, public agencies, stock libraries or submitted materials. Those images may have different rights or restrictions. Follow the specific credit, caption or source note attached to that image."
      }
    ],
    actions: [
      { label: "Read CC BY 4.0", href: "https://creativecommons.org/licenses/by/4.0/" },
      { label: "Contact Us", href: "/contact/" }
    ]
  },
  {
    slug: "terms",
    title: "Terms of Service",
    eyebrow: "Policies",
    description:
      "These terms explain how readers may use the Weekly Wildcat website and what to expect from our published content.",
    sections: [
      {
        title: "Effective Date",
        body: "These terms are effective July 1, 2026. By using weeklywildcat.com, you agree to use the site in a lawful and respectful way."
      },
      {
        title: "About This Site",
        body:
          "Weekly Wildcat is a student newspaper serving Ninety Six High School and its community. The site publishes school news, sports coverage, features, opinion, photos and other student-produced journalism."
      },
      {
        title: "Editorial Content",
        body: [
          "We work to publish information that is accurate, fair and useful at the time it appears. News stories, features, photos, headlines and other editorial content may be updated, corrected or removed when needed.",
          "Opinion pieces reflect the views of the credited writers. They do not necessarily represent every student, staff member, adviser, administrator or reader."
        ]
      },
      {
        title: "Corrections and Concerns",
        body:
          "If you believe something on the site is inaccurate, incomplete, unfair or raises a privacy concern, contact us with the story title, the issue and any helpful context. We will review good-faith concerns and correct the record when appropriate."
      },
      {
        title: "Using Our Work",
        body:
          "Unless otherwise noted, Weekly Wildcat articles, photos, graphics, logos and page designs may not be copied, republished, sold or used in full without permission. Sharing links to our stories is welcome. Short excerpts may be used with clear credit and a link back to the original story."
      },
      {
        title: "Reader Submissions",
        body:
          "When you send us a story idea, correction, photo, tip, letter, comment, advertising inquiry or other message, you give Weekly Wildcat permission to review it and follow up. Submitting something does not guarantee that it will be published."
      },
      {
        title: "Advertising and Sponsorships",
        body:
          "Advertising and sponsorships help support the publication, but advertisers do not control our editorial coverage. Weekly Wildcat may decline advertising that is inappropriate for a school community or does not fit the publication."
      },
      {
        title: "External Links",
        body:
          "The site may link to outside websites, social platforms, forms, maps, videos or other services. Those sites are controlled by their own owners and policies. Weekly Wildcat is not responsible for their content, security or privacy practices."
      },
      {
        title: "Prohibited Use",
        body:
          "Do not use the site to harass others, attempt to break into systems, scrape content at scale, upload harmful code, impersonate someone else, interfere with site operation or violate any law or school rule."
      },
      {
        title: "No Guarantee",
        body:
          "We try to keep the site available and accurate, but we cannot promise that every page will always be current, complete, uninterrupted or error-free. The site is provided as a student publication and community information resource."
      },
      {
        title: "Changes to These Terms",
        body:
          "We may update these terms as the publication and website grow. The newest version will be posted on this page."
      }
    ],
    actions: [
      { label: "Privacy Policy", href: "/privacy/" },
      { label: "Contact Us", href: "/contact/" }
    ]
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    eyebrow: "Policies",
    description:
      "Weekly Wildcat keeps the website simple and avoids collecting personal information we do not need.",
    sections: [
      {
        title: "Effective Date",
        body: "This privacy policy is effective July 1, 2026. It explains what information may be collected when you visit weeklywildcat.com or contact Weekly Wildcat."
      },
      {
        title: "Information We Collect",
        body: [
          "You can read Weekly Wildcat without creating an account. The site does not offer public comments, reader profiles or user logins.",
          "Like most websites, our hosting provider may automatically process basic technical information such as IP address, browser type, device information, referring page, pages requested and the time of a visit. This helps the site load, stay secure and troubleshoot problems."
        ]
      },
      {
        title: "Information You Send Us",
        body:
          "If you contact us, send a tip, request a correction, submit a photo, ask about advertising or join the staff, we may receive the name, email address, message and any files or details you choose to provide. We use that information to respond, review the request and run the publication."
      },
      {
        title: "Student Names, Photos and Stories",
        body: [
          "Weekly Wildcat publishes student journalism about school life. Stories may include names, photos, quotes, teams, clubs, activities, awards, events and other information that is appropriate for publication in a school newspaper.",
          "We try to use careful judgment, especially when coverage involves sensitive topics, younger students, discipline, health, safety or private family matters. If you have a concern about published student information, contact us so we can review it."
        ]
      },
      {
        title: "Cookies and Analytics",
        body:
          "The site is designed to work without reader accounts or advertising trackers. Some hosting, security, analytics, font, media or embedded services may use cookies or similar technologies to provide their services, measure traffic or protect the site."
      },
      {
        title: "Newsletter Security Check",
        body:
          "When you sign up for the newsletter, Weekly Wildcat uses Cloudflare Turnstile to help distinguish people from bots and protect the form from abuse. Cloudflare may process security signals such as IP address, browser information and sitekey details for bot detection and related security purposes.",
        actions: [
          {
            label: "Cloudflare Turnstile Privacy Addendum",
            href: "https://www.cloudflare.com/en-gb/turnstile-privacy-policy/"
          }
        ]
      },
      {
        title: "Outside Services",
        body:
          "Weekly Wildcat uses a WordPress CMS, static website hosting, local media assets and links to outside services such as social platforms, email, maps, videos or forms. When you follow an outside link or load third-party content, that service may collect information under its own privacy policy."
      },
      {
        title: "How We Share Information",
        body:
          "We do not sell reader personal information. We may share information when needed to operate the site, respond to a request, work with school staff or advisers, protect safety, address misuse, comply with law or handle a correction or privacy concern."
      },
      {
        title: "How Long We Keep Information",
        body:
          "Published stories may remain online as part of the public record of the student newspaper. Messages, tips, corrections, advertising inquiries and staff-interest notes may be kept as long as needed for newsroom, school, technical or recordkeeping purposes."
      },
      {
        title: "Children’s Privacy",
        body:
          "Weekly Wildcat is a school newspaper website for a general school and community audience. We do not knowingly ask children under 13 to create accounts or provide personal information through the public site. If you believe a child has sent personal information that should be removed, contact us."
      },
      {
        title: "Your Choices",
        body:
          "You may ask us to review a privacy concern, correct inaccurate information, remove certain submitted information or explain how a message you sent was used. Some published material may be retained when there is a legitimate editorial, school or recordkeeping reason."
      },
      {
        title: "Security",
        body:
          "No website can guarantee perfect security, but we try to keep the public site simple and limit the information we collect. Do not send passwords, private account numbers, medical details or other sensitive information unless we specifically ask for it."
      },
      {
        title: "Changes to This Policy",
        body:
          "We may update this privacy policy as the website, publication tools or school needs change. The newest version will be posted on this page."
      }
    ],
    actions: [
      { label: "Contact Us", href: "/contact/" },
      { label: "Terms of Service", href: "/terms/" }
    ]
  },
  {
    slug: "contact",
    title: "Contact",
    eyebrow: "Newsroom",
    description:
      "Send questions, corrections, story ideas, advertising interest or newsroom inquiries to Weekly Wildcat.",
    sections: [
      {
        title: "School Address",
        body: "Weekly Wildcat, Ninety Six High School, 640 South Cambridge Street, Ninety Six, SC."
      },
      {
        title: "What to Send",
        body:
          "Readers can share story tips, correction requests, event information, sports updates, photo opportunities, advertising questions or ideas for future coverage."
      }
    ],
    actions: [
      { label: "Submit a Story Idea", href: "/contact/" },
      { label: "Join Our Team", href: "/join/" }
    ]
  }
];

export function getStaticPage(slug: string) {
  return STATIC_PAGES.find((page) => page.slug === slug) ?? null;
}
