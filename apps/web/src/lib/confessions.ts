import manifestJson from "../data/confessions/manifest.json";
import belgicConfessionJson from "../data/confessions/belgic-confession.json";
import canonsOfDordtJson from "../data/confessions/canons-of-dordt.json";
import lbcf1689Json from "../data/confessions/lbcf-1689.json";
import savoyDeclarationJson from "../data/confessions/savoy-declaration.json";
import secondHelveticConfessionJson from "../data/confessions/second-helvetic-confession.json";
import westminsterConfessionJson from "../data/confessions/westminster-confession.json";

export type Unit = {
  number: number;
  title: string;
  content: string[];
};

export type Confession = {
  slug: string;
  shortCode: string;
  title: string;
  unitLabel: string;
  sourceUrl: string;
  units: Unit[];
};

type ConfessionManifest = {
  updatedAt: string;
  slugs: string[];
};

export type ConfessionAbout = {
  title: string;
  paragraphs: string[];
};

const manifest = manifestJson as ConfessionManifest;
const confessionsBySlug = new Map<string, Confession>(
  [
    westminsterConfessionJson,
    lbcf1689Json,
    savoyDeclarationJson,
    belgicConfessionJson,
    secondHelveticConfessionJson,
    canonsOfDordtJson,
  ].map((item) => {
    const confession = item as Confession;
    return [confession.slug, confession];
  })
);

const confessions = manifest.slugs
  .map((slug) => confessionsBySlug.get(slug))
  .filter(Boolean) as Confession[];

export function listConfessions(): Confession[] {
  return confessions;
}

export function findConfession(slug: string): Confession | null {
  return confessionsBySlug.get(slug) ?? null;
}

export function getUpdatedAt(): string {
  return manifest.updatedAt;
}

export function getConfessionDisplayUnits(confession: Confession): Unit[] {
  if (confession.slug === "belgic-confession") {
    return confession.units.filter((unit) => unit.number > 0);
  }
  return confession.units;
}

export function getConfessionAboutUnit(confession: Confession): Unit | null {
  if (confession.slug !== "belgic-confession") {
    return null;
  }
  return confession.units.find((unit) => unit.number === 0) ?? null;
}

export function getConfessionAbout(confession: Confession): ConfessionAbout {
  const aboutUnit = getConfessionAboutUnit(confession);
  if (aboutUnit?.content?.length) {
    return {
      title: aboutUnit.title,
      paragraphs: aboutUnit.content,
    };
  }

  if (confession.slug === "westminster-confession") {
    return {
      title: "Mr Thomas Manton's epistle to the reader.",
      paragraphs: [
        "Christian Reader,",
        "I cannot suppose thee to be such a stranger in England as to be ignorant of the general complaint concerning the decay of the power of godliness, and more especially of the great corruption of youth. Wherever thou goest, thou wilt hear men crying out of bad children and bad servants; whereas indeed the source of the mischief must be sought a little higher: it is bad parents and bad masters that make bad children and bad servants; and we cannot blame so much their untowardness, as our own negligence in their education.",
        "The devil hath a great spite at the kingdom of Christ, and he knoweth no such compendious way to crush it in the egg, as by the perversion of youth, and supplanting family-duties. He striketh at all those duties which are publick in the assemblies of the saints, but these are too well guarded by the solemn injunctions and dying charge of Jesus Christ, as that he should ever hope totally to subvert and undermine them; but at family-duties he striketh with the more success, because the institution is not so solemn, and the practice not so seriously and conscientiously regarded as it should be, and the omission is not so liable to notice and publick censure. Religion was first hatched in families, and there the devil seeketh to crush it; the families of the Patriarchs were all the Churches God had in the world for the time: and therefore. (I suppose,) when Cain went out from Adam's family, he is said to go out from the face of the Lord, Gen. 4:16. Now, the devil knoweth that this is a blow at the root, and a ready way to prevent the succession of Churches: if he can subvert families, other societies and communities will not long flourish and subsist with any power and vigour; for there is the stock from whence they are supplied both for the present and future.",
        "For the present: A family is the seminary of Church and State; and if children be not well principled there, all miscarrieth: a fault in the first concoction is not mended in the second; if youth be bred ill in the family, they prove ill in Church and Commonwealth; there is the first making or marring, and the presage of their future lives to be thence taken, Prov. 20:11. By family discipline, officers are trained up for the Church, 1 Tim. 3:4, One that ruleth well his own house, etc.; and there are men bred up in subjection and obedience. It is noted, Acts 21:5, that the disciples brought Paul on his way with their wives and children; their children probably are mentioned, to intimate, that their parents would, by their own example and affectionate farewell to Paul, breed them up in a way of reverence and respect to the pastors of the Church.",
        "For the future: It is comfortable, certainly, to see a thriving nursery of young plants, and to have hopes that God shall have a people to serve him when we are dead and gone: the people of God comforted themselves in that, Ps. 102:28, The children of thy servants shall continue, etc",
        "Upon all these considerations, how careful should ministers and parents be to train up young ones whilst they are yet pliable, and, like wax, capable of any form and impression, in the knowledge and fear of God; and betimes to instil the principles of our most holy faith, as they are drawn into a short sum in Catechisms, and so altogether laid in the view of conscience! Surely these seeds of truth planted in the field of memory, if they work nothing else, will at least be a great check and bridle to them and, as the casting in of cold water doth stay the boiling of the pot, somewhat allay the fervours of youthful lusts and passions.",
        "I had, upon entreaty, resolved to recommend to thee with the greatest earnestness the work of catechising, and, as a meet help, the usefulness of this book, as thus printed with the Scriptures at large: but meeting with a private letter of a very learned and godly divine, wherein that work is excellently done to my hand, I shall make bold to transcribe a part of it, and offer it to publick view.",
        "The author having bewailed the great distractions, corruptions, and divisions that are in the Church, he thus represents the cause and cure:",
        "Among others, a principal cause of these mischiefs is the great and common neglect of the governors of families, in the discharge of that duty which they owe to God for the souls that are under their charge, especially in teaching them the doctrine of Christianity. Families are societies that must he sanctified to God as well as Churches; and the governors of them have as truly a charge of the souls that are therein, as pastors have of the Churches. But, alas, how little is this considered or regarded ! But while negligent ministers are (deservedly) cast out of their places, the negligent masters of families take themselves to be almost blameless. They offer their children to God in baptism, and there they promise to teach them the doctrine of the gospel, and bring them up in the nurture of the Lord; but they easily promise, and easily break it; and educate their children for the world and the flesh, although they have renounced these, and dedicated them to God. This covenant-breaking with God, and betraying the souls of their children to the devil. must lie heavy on them here or hereafter. They beget children, and keep families merely for the world and the flesh: but little consider what a charge is committed to them, and what it is to bring up a child for God, and govern a family as a sanctified society.",
        "O how sweetly and successfully would the work of God go on, if we would but all join together in our several places to promote it! Men need not then run without sending to be preachers; but they might find that part of the work that belongeth to them to be enough for them, and to be the best that they can be employed in. Especially women should be careful of this duty; because as they are most about their children, and have early and frequent opportunities to instruct them, so this is the principal service they can do to God in this world, being restrained from more publick work. And doubtless many an excellent magistrate hath been sent into the Commonwealth, and many an excellent pastor into the Church, and many a precious saint to heaven, through the happy preparations of a holy education, perhaps by a woman that thought herself useless and unserviceable to the Church. Would parents but begin betimes, and labour to affect the hearts of their children with the great matters of everlasting life, and to acquaint them with the substance of the doctrine of Christ, and, when they find in them the knowledge and love of Christ, would bring them then to the pastors of the Church to be tried, confirmed and admitted to the further privileges of the Church, what happy, well-ordered Churches might we have ! Then one pastor need not be put to do the work of two or three hundred or thousand governors of families, even to teach their children those principles which they should have taught them long before; nor should we be put to preach to so many miserable ignorant souls, that be not prepared by education to understand us, nor should we have need to shut out so many from holy communion upon the account of ignorance, that yet have not the grace to feel it and lament it, nor the wit and patience to wait in a learning state, till they are ready to be fellow-citizens with the saints, and of the household of God. But now they come to us with aged self-conceitedness, being past children, and yet worse than children still; having the ignorance of children, but being overgrown the teachableness of children, and think themselves wise, yea wise enough to quarrel with the wisest of their teachers, because they have lived long enough to have been wise, and the evidence of their knowledge is their aged ignorance; and they are readier to flee in our faces for Church-privileges, than to learn of us, and obey our instructions, till they are prepared for them, that they may do them good, like snappish curs that will snap us by the fingers for their meat, and snatch it out of our hands; and not like children, that stay till we give it them. Parents have so used them to be unruly, that ministers have to deal but with too few but the unruly. And it is for want of this laying the foundation well at first, that professors themselves are so ignorant as most are, and that so many, especially of the younger sort, do swallow down almost any error that is offered them, and follow any sect of dividers that will entice them so it be but done with earnestness and plausibility. For, alas ! though by the grace of God their hearts may be changed in an hour, (whenever they understand but the essentials of the faith,) yet their understandings must have time and diligence to furnish them with such knowledge as must stablish them, and fortify them against deceits. Upon these, and many the like considerations. we should entreat all Christian families to take more pains in this necessary work, and to get better acquainted with the substance of Christianity. And, to that end, (taking along some moving treatises to awake the heart,) I know not what work should be fitter for their use, than that compiled by the Assembly at Westminster; a Synod of as godly, judicious divines, (notwithstanding all the bitter words which they have received from discontented and self-conceited men,) I verily think, as ever England saw. Though they had the unhappiness to be employed in calamitous times, when the noise of wars did stop men's ears, and the licentiousness of wars did set every wanton tongue and pen at liberty to reproach them, and the prosecution and event of those wars did exasperate partial discontented men to dishonour themselves by seeking to dishonour them; I dare say, if in the days of old, when councils were in power and account, they had had but such a council of bishops, as this of presbyters was, the fame of it for learning and holiness, and all ministerial abilities, would, with very great honour, have been transmitted to posterity.",
        "I do therefore desire, that all masters of families would first study well this work themselves, and then teach it their children and servants, according to their several capacities. And, if they once understand these grounds of religion, they will be able to read other books more understandingly, and hear sermons more profitably, and confer more judiciously, and hold fast the doctrine of Christ more firmly, than ever you are like to do by any other course. First, let them read and learn the Shorter Catechism, and next the Larger and lastly, read the Confession of Faith.",
        "Thus far he, whose name I shall conceal, (though the excellency of the matter and present style, will easily discover him,) because I have published it without his privily and consent, though, I hope, not against his liking and approbation. I shall add no more, but that I am,",
        "Thy servant, in the Lord's work, THOMAS MANTON.",
      ],
    };
  }

  if (confession.slug === "savoy-declaration") {
    return {
      title: "A Preface.",
      paragraphs: [
        "Confession of the Faith that is in us, when justly called for, is so indispensable a due all owe to the Glory of the Sovereign GOD, that it is ranked among the Duties of the first Commandment, such as Prayer is; and therefore by Paul yoked with Faith itself, as necessary to salvation: with the heart man believeth unto righteousness, and with the mouth confession is made unto salvation. Our Lord Christ himself, when he was accused of his Doctrine, considered simply as a matter of fact by Preaching, refused to answer; because, as such, it lay upon evidence, and matter of testimony of others; unto whom therefore he refers himself: But when both the High-Priest and Pilate expostulate his Faith, and what he held himself to be; he without any demur at all, cheerfully makes Declaration, That he was the Son of God; so to the High-Priest: and that he was a King, and born to be a King; thus to Pilate. Though upon the uttering of it his life lay at the stake; Which holy Profession of his is celebrated for our example, 1 Tim. vi. 13.",
        "Confessions, when made by a company of Professors of Christianity jointly meeting to that end, the most genuine and natural use of such Confessions is, That under the same form of words, they express the substance of the same common salvation or unity of their faith; whereby speaking the same things, they show themselves perfectly joined in the same mind, and in the same judgment, 1 Cor. i. 10.",
        "And accordingly such a transaction is to be looked upon but as a meet or fit medium or means whereby to express that their common faith and salvation, and no way to be made use of as an imposition upon any: Whatever is of force or constraint in matters of this nature, causeth them to degenerate from the name and nature of Confessions, and turns them from being Confessions of Faith, into Exactions and Impositions of Faith.",
        "And such common Confessions of the Orthodox Faith, made in simplicity of heart by any such Body of Christians, with concord among themselves, ought to be entertained by all others that love the truth as it is in Jesus, with an answerable rejoicing: For if the unanimous opinions and assertions but in some few points of Religion, and that when by two Churches, namely, that of Jerusalem, and the Messengers of Antioch met, assisted by some of the Apostles, were by the Believers of those times received with so much joy, (as it is said, They rejoiced for the consolation) much more this is to be done, when the whole substance of Faith, and form of wholesome words shall be declared by the Messengers of a multitude of Churches, though wanting those advantages of Counsel and Authority of the Apostles, which that Assembly had.",
        "Which acceptation is then more specially due, when these shall (to choose) utter and declare their Faith, in the same substance for matter, yea, words, for the most part, that other Churches and Assemblies, reputed the most Orthodox, have done before them: For upon such a correspondency, all may see that actually accomplished, which the Apostle did but exhort unto, and pray for, in those two more eminent Churches of the Corinthians and the Romans, (and so in them for all the Christians of his time) that both Jew and Gentile, that is, men of different persuasions, (as they were) might glorify GOD with one mind and with one mouth. And truly, the very turning of the Gentiles to the owning of the same Faith, in the substance of it, with the Christian Jew (though differing in greater points than we do from our Brethren) is presently after dignified by the Apostle with this style, That if is the Confession of Jesus Christ himself; not as the Object only, but as the Author and Maker thereof: I will confess to thee (saith Christ to God) among the Gentiles. So that in all such accords, Christ is the great and first Confessor; and we, and all our Faith uttered by Us, are but the Epistles, (as Paul) and Confessions (as Isaiah there) of their Lord and ours; He, but expressing what is written in his heart, through their hearts and mouths, to the glory of God the Father: And shall not we all rejoice herein, when as Christ himself is said to do it upon this occasion: as it there also follows, I will sing unto thy Name.",
        "Further, as the soundness and wholesomeness of the matter gives the vigor and life to such 709Confessions, so the inward freeness, willingness, and readiness of the Spirits of the Confessors do contribute the beauty and loveliness thereunto: As it is in Prayer to God, so in Confessions made to men. If two or three met, do agree, it renders both, to either the more acceptable. The Spirit of Christ is in himself too free, great and generous a Spirit, to suffer himself to be used by any human arm, to whip men into belief; he drives not, but gently leads into all truth, and persuades men to dwell in the tents of like precious Faith; which would lose of its preciousness and value, if that sparkle of freeness shone not in it: The Character of His People, is to be a willing people in the day of his power (not Man's) in the beauties of holiness, which are the Assemblings of the Saints: one glory of which Assemblings in that first Church, is said to have been, They met with one accord; which is there in that Psalm prophesied of, in the instance of that first Church, for all other that should succeed.",
        "And as this great Spirit is in himself free, when, and how far, and in whom to work, so where and when he doth work, he carrieth it with the same freedom, and is said to be a free Spirit, as he both is, and works in us: And where this Spirit of the Lord is, there is liberty.",
        "Now, as to this Confession of ours, besides, that a conspicuous conjunction of the particulars mentioned, hath appeared therein: There are also four remarkable Attendants thereon, which added, might perhaps in the eyes of sober and indifferent Spirits, give the whole of this Transaction a room and rank amongst other many good and memorable things of this Age; at least all set together, do cast as clear a gleam and manifestation of God's Power and Presence, as hath appeared in any such kind of Confessions, made by so numerous a company these later years.",
        "The first, is the Temper (or distemper rather) of the Times, during which, these Churches have been gathering, and which they have run through. All do (out of a general sense) complain that the times have been perilous, or difficult times (as the Apostle foretold); and that in respect to danger from seducing spirits, more perilous than the hottest seasons of Persecution.",
        "We have failed through an AEstuation, Fluxes and Refluxes of great varieties of Spirits, Doctrines, Opinions and Occurrences, and especially in the matter of Opinions, which have been accompanied in their several seasons, with powerful persuasions and temptations, to seduce those of our way. It is known, men have taken the freedom (notwithstanding what Authority hath interposed to the contrary) to vent and vend their own vain and accursed imaginations, contrary to the great and fixed Truths of the Gospel, insomuch as many of us have been compelled to enter into a strict and close search of our hearts, and ways, and to pray and cry mightily unto God, as for our lives, that we might not be hurried aside by those cunning sleights of men. Yet the Lord hath preserved us, not only from running after those specious Deceits, but also from the neglect or denial of the Truths themselves, which we have now made this joint confession of.",
        "The second, is the smallness of the beginnings of these Churches, and the meanness (as to this world) both of the Persons and Places where the Lord hath set them. Those whom God hath thus gathered together have been for the most part men of low estate, and of no great repute in the world; and yet the Lord hath made them to shine in the midst of many oppositions, and to hold forth the word of life to the conviction and comfort of many.",
        "The third, is the paucity of helps and advantages that outwardly have attended us. We have wanted many of those accommodations and supplies, which others have enjoyed. Yet the Lord hath not left us destitute, but hath graciously afforded his own presence and blessing in the use of weak means, and hath made his strength perfect in our weakness.",
        "The fourth and last, is the wonderful peace and concord which the Lord was pleased to give unto us in the carrying on of this work. We met together with many fears and jealousies of our own spirits, and of one another, but he that stilleth the noise of the seas, and the tumults of the people, was pleased to still our spirits, and to cause us to agree in the truth, with one heart and one mouth, to the praise of his glorious grace.",
      ],
    };
  }

  if (confession.slug === "lbcf-1689") {
    return {
      title: "To the Judicious and Impartial Reader",
      paragraphs: [
        "It is now many years since divers of us (with other sober Christians then living and walking in the way of the Lord that we professe) did conceive our selves to be under a necessity of Publishing a Confession of our Faith, for the information, and satisfaction of those, that did not throughly understand what our principles were, or had entertained prejudices against our Profession, by reason of the strange representation of them, by some men of note, who had taken very wrong measures, and accordingly led others into misapprehensions, of us, and them: and this was first put forth about the year, 1643.",
        "In the name of seven Congregations then gathered in London; since which time, diverse impressions thereof have been dispersed abroad, and our end proposed, in good measure answered, inasmuch as many (and some of those men eminent, both for piety and learning) were thereby satisfied, that we were no way guilty of those Heterodoxies and fundamental errors, which had too frequently been charged upon us without ground, or occasion given on our part.",
        "And forasmuch, as that Confession is not now commonly to be had; and also that many others have since embraced the same truth which is owned therein; it was judged necessary by us to joyn together in giving a testimony to the world; of our firm adhering to those wholesome Principles, by the publication of this which is now in your hand.",
        "And forasmuch as our method, and manner of expressing our sentiments, in this, doth vary from the former (although the substance of the matter is the same) we shall freely impart to you the reason and occasion thereof.",
        "One thing that greatly prevailed with us to undertake this work, was (not only to give a full account of our selves, to those Christians that differ from us about the subject of Baptism, but also) the profit that might from thence arise, unto those that have any account of our labors, in their instruction, and establishment in the great truths of the Gospel; in the clear understanding, and steady belief of which, our comfortable walking with God, and fruitfulness before him, in all our ways, is most neerly concerned; and therefore we did conclude it necessary to expresse our selves the more fully, and distinctly; and also to fix on such a method as might be most comprehensive of those things which we designed to explain our sense, and belief of; and finding no defect, in this regard, in that fixed on by the assembly, and after them by those of the Congregational way, we did readily conclude it best to retain the same order in our present confession: and also, when we observed that those last mentioned, did in their confession (for reasons which seemed of weight both to themselves and others) choose not only to express their mind in words concurrent with the former in sense, concerning all those articles wherein they were agreed, but also for the most part without any variation of the terms we did in like manner conclude it best to follow their example in making use of the very same words with them both, in these articles (which are very many) wherein our faith and doctrine is the same with theirs, and this we did, the more abundantly, to manifest our consent with both, in all the fundamental articles of the Christian Religion, as also with many others, whose orthodox confessions have been published to the world; on behalf of the Protestants in divers Nations and Cities: and also to convince all, that we have no itch to clogge Religion with new words, but do readily acquiesce in that form of sound words, which hath been, in consent with the holy Scriptures, used by others before us; hereby declaring before God, Angels, & Men, our hearty agreement with them, in that wholesome Protestant Doctrine, which with so clear evidence of Scriptures they have asserted: some things indeed, are in some places added, some terms omitted, and some few changed, but these alterations are of that nature, as that we need not doubt, any charge or suspition of unsoundness in the faith, from any of our brethren upon the account of them.",
        "In those things wherein we differ from others, we have exprest our selves with all candor and plainness that none might entertain jealousie of ought secretly lodged in our breasts, that we would not the world should be acquainted with; yet we hope we have also observed those rules of modesty, and humility, as will render our freedom in this respect inoffensive, even to those whose sentiments are different from ours.",
        "We have also taken care to affix texts of Scripture, in the margin for the confirmation of each article in our confession; in which work we have studiously indeavoured to select such as are most clear and pertinent, for the proof of what is asserted by us: and our earnest desire is, that all into whose hands this may come, would follow that (never enough commended) example of the noble Bereans, who searched the Scriptures daily, that they might find out whether the things preached to them were so or not.",
        "There is one thing more which we sincerely professe, and earnestly desire credence in, viz. That contention is most remote from our design in all that we have done in this matter: and we hope the liberty of an ingenuous unfolding our principles, and opening our hearts unto our Brethren, with the Scripture grounds on which our faith and practise leanes, will by none of them be either denyed to us, or taken ill from us.",
        "Our whole design is accomplished, if we may obtain that Justice, as to be measured in our principles, and practise, and the judgement of both by others, according to what we have now published; which the Lord (whose eyes are as a flame of fire) knoweth to be the doctrine, which with our hearts we must firmly believe, and sincerely indeavour to conform our lives to.",
        "And oh that other contentions being laid asleep, the only care and contention of all upon whom the name of our blessed Redeemer is called, might for the future be, to walk humbly with their God, and in the exercise of all Love and Meekness towards each other, to perfect holyness in the fear of the Lord, each one endeavouring to have his conversation such as becometh the Gospel; and also suitable to his place and capacity vigorously to promote in others the practice of true Religion and undefiled in the sight of God and our Father.",
        "And that in this backsliding day, we might not spend our breath in fruitless complaints of the evils of others; but may every one begin at home, to reform in the first place our own hearts, and wayes; and then to quicken all that we may have influence upon, to the same work; that if the will of God were so, none might deceive themselves, by resting in, and trusting to, a form of Godliness, without the power of it, and inward experience of the efficacy of those truths that are professed by them.",
        "And verily there is one spring and cause of the decay of Religion in our day, which we cannot but touch upon, and earnestly urge a redresse of; and that is the neglect of the worship of God in Families, by those to whom the charge and conduct of them is committed.",
        "May not the grosse ignorance, and instability of many; with the prophaneness of others, be justly charged upon their Parents and Masters; who have not trained them up in the way wherein they ought to walk when they were young? but have neglected those frequent and solemn commands which the Lord hath laid upon them so to catechize, and instruct them, that their tender years might be seasoned with the knowledge of the truth of God as revealed in the Scriptures; and also by their own omission of Prayer, and other duties of Religion in their families, together with the ill example of their loose conversation, have inured them first to a neglect, and then contempt of all Piety and Religion? we know this will not excuse the blindness, or wickedness of any; but certainly it will fall heavy upon those that have thus been the occasion thereof; they indeed dye in their sins; but will not their blood be required of those under whose care they were, who yet permitted them to go on without warning, yea led them into the paths of destruction? and will not the diligence of Christians with respect to the discharge of these duties, in ages past, rise up in judgment against, and condemn many of those who would be esteemed such now?",
        "We shall conclude with our earnest prayer, that the God of all grace, will pour out those measures of his holy Spirit upon us, that the profession of truth may be accompanyed with the sound belief, and diligent practise of it by us; that his name may in all things be glorified, through Jesus Christ our Lord, Amen.",
      ],
    };
  }

  if (confession.slug === "canons-of-dordt") {
    return {
      title: "About the Canons of Dordt",
      paragraphs: [
        "The Canons of Dordt were adopted by the Synod of Dort in 1618-1619 as a confessional response to the Remonstrant controversy.",
        "They are arranged by heads of doctrine and focus especially on grace, election, the death of Christ, conversion, and the perseverance of the saints.",
        "This edition was moved from the catechism site into the confession site because it belongs with the Reformed confessions rather than with catechisms.",
      ],
    };
  }

  return {
    title: "About this confession",
    paragraphs: ["Placeholder: about text has not been added for this confession yet."],
  };
}
