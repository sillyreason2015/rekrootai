/**
 * Template-based question generation.
 * Generates realistic assessment questions by module type and difficulty.
 */

type QType = 'mcq' | 'open'
type Difficulty = 'easy' | 'medium' | 'hard'
type ModuleType = 'aptitude' | 'technical' | 'situational' | 'personality' | 'values'

interface GenQuestion {
  text: string
  type: QType
  options?: string[]
  correctIndex?: number
  points: number
  category: string
  difficulty: Difficulty
  tags: string[]
}

const APTITUDE: Record<Difficulty, GenQuestion[]> = {
  easy: [
    { text: 'If a train travels 60 km in 1 hour, how far will it travel in 2.5 hours?', type: 'mcq', options: ['100 km', '120 km', '150 km', '180 km'], correctIndex: 2, points: 1, category: 'aptitude', difficulty: 'easy', tags: ['numerical', 'speed'] },
    { text: 'What is the next number in the series: 2, 4, 8, 16, ___?', type: 'mcq', options: ['24', '28', '32', '36'], correctIndex: 2, points: 1, category: 'aptitude', difficulty: 'easy', tags: ['numerical', 'series'] },
    { text: 'If 5 workers complete a job in 10 days, how many days will 10 workers take to complete the same job?', type: 'mcq', options: ['3', '5', '8', '20'], correctIndex: 1, points: 1, category: 'aptitude', difficulty: 'easy', tags: ['numerical', 'work-rate'] },
    { text: 'A rectangle has a length of 12 cm and a width of 7 cm. What is its area?', type: 'mcq', options: ['19 cm²', '38 cm²', '84 cm²', '96 cm²'], correctIndex: 2, points: 1, category: 'aptitude', difficulty: 'easy', tags: ['numerical', 'geometry'] },
    { text: 'Which shape has the most sides: pentagon, hexagon, heptagon, or octagon?', type: 'mcq', options: ['Pentagon', 'Hexagon', 'Heptagon', 'Octagon'], correctIndex: 3, points: 1, category: 'aptitude', difficulty: 'easy', tags: ['verbal', 'reasoning'] },
  ],
  medium: [
    { text: 'A company\'s revenue grew from £250,000 to £325,000. What is the percentage increase?', type: 'mcq', options: ['20%', '23%', '30%', '34%'], correctIndex: 2, points: 2, category: 'aptitude', difficulty: 'medium', tags: ['numerical', 'percentage'] },
    { text: 'If all Bloops are Razzles and all Razzles are Lazzles, which statement must be true?', type: 'mcq', options: ['All Bloops are Lazzles', 'All Lazzles are Bloops', 'Some Bloops are not Lazzles', 'No Lazzles are Bloops'], correctIndex: 0, points: 2, category: 'aptitude', difficulty: 'medium', tags: ['logical', 'deduction'] },
    { text: 'A project requires 120 person-hours. If 4 people work on it for 5 days, how many hours per day must each person work?', type: 'mcq', options: ['4 hours', '5 hours', '6 hours', '8 hours'], correctIndex: 2, points: 2, category: 'aptitude', difficulty: 'medium', tags: ['numerical', 'work-rate'] },
    { text: 'What comes next in the sequence: 1, 1, 2, 3, 5, 8, 13, ___?', type: 'mcq', options: ['18', '20', '21', '24'], correctIndex: 2, points: 2, category: 'aptitude', difficulty: 'medium', tags: ['numerical', 'fibonacci'] },
    { text: 'Three colleagues share a bonus in the ratio 2:3:5. If the total bonus is £5,000, how much does the person with the largest share receive?', type: 'mcq', options: ['£1,000', '£1,500', '£2,000', '£2,500'], correctIndex: 3, points: 2, category: 'aptitude', difficulty: 'medium', tags: ['numerical', 'ratio'] },
    { text: 'Describe your approach to breaking down a complex problem into manageable components.', type: 'open', points: 3, category: 'aptitude', difficulty: 'medium', tags: ['problem-solving'] },
  ],
  hard: [
    { text: 'A factory produces 500 units/day at 80% efficiency. How many units would it produce in a 5-day week at 95% efficiency?', type: 'mcq', options: ['2,500', '2,875', '2,969', '3,125'], correctIndex: 2, points: 3, category: 'aptitude', difficulty: 'hard', tags: ['numerical', 'efficiency'] },
    { text: 'In a group of 60 people, 35 read newspaper A, 25 read newspaper B, and 10 read both. How many read neither?', type: 'mcq', options: ['0', '5', '10', '15'], correctIndex: 2, points: 3, category: 'aptitude', difficulty: 'hard', tags: ['numerical', 'sets'] },
    { text: 'If the probability of event X is 0.4 and event Y is 0.3, and they are independent, what is the probability of neither X nor Y occurring?', type: 'mcq', options: ['0.12', '0.30', '0.42', '0.58'], correctIndex: 2, points: 3, category: 'aptitude', difficulty: 'hard', tags: ['numerical', 'probability'] },
    { text: 'Critically analyse the logical structure of this argument: "All successful companies invest in R&D. Company X does not invest in R&D. Therefore, Company X will not succeed."', type: 'open', points: 4, category: 'aptitude', difficulty: 'hard', tags: ['critical-thinking', 'logic'] },
  ],
}

const TECHNICAL: Record<Difficulty, GenQuestion[]> = {
  easy: [
    { text: 'Which data structure operates on a First-In-First-Out (FIFO) principle?', type: 'mcq', options: ['Stack', 'Queue', 'Heap', 'Tree'], correctIndex: 1, points: 1, category: 'technical', difficulty: 'easy', tags: ['data-structures', 'cs-fundamentals'] },
    { text: 'What does HTTP stand for?', type: 'mcq', options: ['HyperText Transfer Protocol', 'HyperText Transport Process', 'High Transfer Text Protocol', 'Hyper Transfer Text Process'], correctIndex: 0, points: 1, category: 'technical', difficulty: 'easy', tags: ['networking', 'web'] },
    { text: 'Which of the following is NOT a version control system?', type: 'mcq', options: ['Git', 'SVN', 'Mercurial', 'Docker'], correctIndex: 3, points: 1, category: 'technical', difficulty: 'easy', tags: ['tools', 'devops'] },
    { text: 'What is the time complexity of a binary search on a sorted array of n elements?', type: 'mcq', options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], correctIndex: 1, points: 1, category: 'technical', difficulty: 'easy', tags: ['algorithms', 'complexity'] },
    { text: 'Explain the difference between a compiled language and an interpreted language.', type: 'open', points: 2, category: 'technical', difficulty: 'easy', tags: ['programming-languages', 'cs-fundamentals'] },
  ],
  medium: [
    { text: 'Which SQL join returns all rows from the left table and matching rows from the right table, with NULLs for non-matching right rows?', type: 'mcq', options: ['INNER JOIN', 'RIGHT JOIN', 'LEFT JOIN', 'FULL OUTER JOIN'], correctIndex: 2, points: 2, category: 'technical', difficulty: 'medium', tags: ['sql', 'databases'] },
    { text: 'What design pattern separates object construction from its representation?', type: 'mcq', options: ['Observer', 'Builder', 'Singleton', 'Decorator'], correctIndex: 1, points: 2, category: 'technical', difficulty: 'medium', tags: ['design-patterns', 'oop'] },
    { text: 'In RESTful APIs, which HTTP method is idempotent and should be used for full resource updates?', type: 'mcq', options: ['POST', 'PATCH', 'PUT', 'DELETE'], correctIndex: 2, points: 2, category: 'technical', difficulty: 'medium', tags: ['rest', 'api-design'] },
    { text: 'What is the primary purpose of an index in a relational database?', type: 'mcq', options: ['To enforce constraints', 'To speed up data retrieval', 'To normalise data', 'To back up data'], correctIndex: 1, points: 2, category: 'technical', difficulty: 'medium', tags: ['databases', 'performance'] },
    { text: 'Describe the key differences between process-based and thread-based concurrency models, including their trade-offs.', type: 'open', points: 3, category: 'technical', difficulty: 'medium', tags: ['concurrency', 'systems'] },
    { text: 'Explain the CAP theorem and give an example of a system that prioritises availability over consistency.', type: 'open', points: 3, category: 'technical', difficulty: 'medium', tags: ['distributed-systems', 'databases'] },
  ],
  hard: [
    { text: 'Which consistency model guarantees that once a write is acknowledged, all subsequent reads will reflect that write?', type: 'mcq', options: ['Eventual consistency', 'Causal consistency', 'Strong consistency', 'Read-your-writes consistency'], correctIndex: 2, points: 3, category: 'technical', difficulty: 'hard', tags: ['distributed-systems', 'consistency'] },
    { text: 'Design and explain a rate-limiting algorithm that handles burst traffic while maintaining fairness across clients. What are the trade-offs of your chosen approach?', type: 'open', points: 5, category: 'technical', difficulty: 'hard', tags: ['system-design', 'algorithms'] },
    { text: 'Describe how you would design a distributed caching layer for a high-traffic e-commerce platform. Include cache invalidation strategy.', type: 'open', points: 5, category: 'technical', difficulty: 'hard', tags: ['system-design', 'caching', 'distributed-systems'] },
    { text: 'In a microservices architecture, how would you implement distributed transactions while maintaining data consistency without two-phase commit?', type: 'open', points: 5, category: 'technical', difficulty: 'hard', tags: ['microservices', 'transactions', 'architecture'] },
  ],
}

const SITUATIONAL: Record<Difficulty, GenQuestion[]> = {
  easy: [
    { text: 'You notice a colleague has made a small mistake in a report that has already been sent internally but not externally. What do you do?', type: 'open', points: 2, category: 'situational', difficulty: 'easy', tags: ['judgement', 'communication'] },
    { text: 'A customer contacts you with a complaint about a product defect. The solution is outside your authority. How do you handle this?', type: 'mcq', options: ['Apologise and end the conversation', 'Escalate to your manager immediately without further investigation', 'Acknowledge the complaint, gather details, and escalate with full context', 'Tell the customer to contact another department'], correctIndex: 2, points: 2, category: 'situational', difficulty: 'easy', tags: ['customer-service', 'judgement'] },
  ],
  medium: [
    { text: 'You are halfway through a critical project when you realise your initial technical approach has a fundamental flaw. Delivery is in two weeks. How do you respond?', type: 'open', points: 3, category: 'situational', difficulty: 'medium', tags: ['problem-solving', 'project-management'] },
    { text: 'A team member consistently misses deadlines, affecting the whole team\'s performance. Your manager is aware but has taken no action. What do you do?', type: 'open', points: 3, category: 'situational', difficulty: 'medium', tags: ['teamwork', 'leadership', 'communication'] },
    { text: 'You are asked to implement a feature you believe is ethically questionable but not illegal. Your manager insists it is necessary for a key client. How do you proceed?', type: 'open', points: 4, category: 'situational', difficulty: 'medium', tags: ['ethics', 'leadership', 'judgement'] },
    { text: 'When two equally urgent priorities compete for your time, which approach is most effective?', type: 'mcq', options: ['Work on whichever feels easier first', 'Ask your manager to make the decision for you', 'Assess impact/effort, communicate the trade-off to stakeholders, and agree a priority', 'Work on both simultaneously to show effort'], correctIndex: 2, points: 3, category: 'situational', difficulty: 'medium', tags: ['prioritisation', 'communication'] },
  ],
  hard: [
    { text: 'You discover that a senior colleague has been falsifying data in reports presented to leadership. Confronting them directly previously resulted in them dismissing your concern. What are your options and what would you do?', type: 'open', points: 5, category: 'situational', difficulty: 'hard', tags: ['ethics', 'integrity', 'leadership'] },
    { text: 'You are leading a cross-functional team with members from three different countries and time zones. The project is falling behind due to miscommunication. Describe your diagnostic process and recovery plan.', type: 'open', points: 5, category: 'situational', difficulty: 'hard', tags: ['leadership', 'communication', 'cross-functional'] },
    { text: 'You have been given ownership of a failing product with a team that has low morale and unclear goals. You have 90 days to show improvement. What is your structured approach?', type: 'open', points: 5, category: 'situational', difficulty: 'hard', tags: ['leadership', 'strategy', 'turnaround'] },
  ],
}

const PERSONALITY: Record<Difficulty, GenQuestion[]> = {
  easy: [
    { text: 'I prefer to plan tasks thoroughly before starting them.', type: 'mcq', options: ['Strongly agree', 'Agree', 'Disagree', 'Strongly disagree'], points: 1, category: 'personality', difficulty: 'easy', tags: ['conscientiousness', 'planning'] },
    { text: 'I feel energised after spending time with large groups of people.', type: 'mcq', options: ['Strongly agree', 'Agree', 'Disagree', 'Strongly disagree'], points: 1, category: 'personality', difficulty: 'easy', tags: ['extraversion', 'social'] },
    { text: 'When given feedback, I prefer specific examples over general impressions.', type: 'mcq', options: ['Strongly agree', 'Agree', 'Disagree', 'Strongly disagree'], points: 1, category: 'personality', difficulty: 'easy', tags: ['growth-mindset', 'communication'] },
  ],
  medium: [
    { text: 'Describe a time when you had to adapt quickly to a significant change at work. What did you learn about yourself?', type: 'open', points: 2, category: 'personality', difficulty: 'medium', tags: ['adaptability', 'self-awareness'] },
    { text: 'I find it easy to remain objective when I have a strong personal opinion about a topic.', type: 'mcq', options: ['Strongly agree', 'Agree', 'Disagree', 'Strongly disagree'], points: 2, category: 'personality', difficulty: 'medium', tags: ['objectivity', 'emotional-intelligence'] },
    { text: 'How do you typically respond when a project you have invested significant effort in is cancelled or reprioritised?', type: 'open', points: 2, category: 'personality', difficulty: 'medium', tags: ['resilience', 'attitude'] },
  ],
  hard: [
    { text: 'Describe a situation where your values conflicted with what your organisation expected of you. How did you navigate it, and what would you do differently?', type: 'open', points: 4, category: 'personality', difficulty: 'hard', tags: ['values', 'integrity', 'self-awareness'] },
    { text: 'What does psychological safety mean to you, and how have you actively contributed to or undermined it in a team setting?', type: 'open', points: 4, category: 'personality', difficulty: 'hard', tags: ['leadership', 'emotional-intelligence', 'team-dynamics'] },
  ],
}

const VALUES: Record<Difficulty, GenQuestion[]> = {
  easy: [
    { text: 'Our team is asked to deliver a project faster than you believe is safe or thorough. What do you do?', type: 'mcq', options: ['Agree and deliver on the shortened timeline', 'Raise the risk clearly, propose a realistic alternative, and let leadership decide', 'Refuse outright', 'Say nothing and do your best'], correctIndex: 1, points: 2, category: 'values', difficulty: 'easy', tags: ['integrity', 'communication'] },
    { text: 'A colleague takes sole credit for work the team did together. How do you respond?', type: 'mcq', options: ['Say nothing to avoid conflict', 'Address it privately with the colleague first', 'Escalate to management immediately', 'Post in a group channel to correct the record publicly'], correctIndex: 1, points: 2, category: 'values', difficulty: 'easy', tags: ['fairness', 'integrity'] },
    { text: 'How important is it that your personal values align with your employer\'s stated mission?', type: 'mcq', options: ['Not important — work is work', 'Somewhat important but not a dealbreaker', 'Very important — misalignment affects motivation and decision-making', 'Only matters for leadership roles'], correctIndex: 2, points: 1, category: 'values', difficulty: 'easy', tags: ['culture-fit', 'motivation'] },
    { text: 'Describe what integrity in the workplace means to you and give an example of a time you demonstrated it.', type: 'open', points: 3, category: 'values', difficulty: 'easy', tags: ['integrity', 'self-awareness'] },
  ],
  medium: [
    { text: 'You are asked to present data in a way that technically is accurate but you believe is misleading to stakeholders. What do you do?', type: 'open', points: 4, category: 'values', difficulty: 'medium', tags: ['integrity', 'ethics', 'communication'] },
    { text: 'Our company values transparency. Describe how you have actively practised transparency in a previous role, including a situation where it was uncomfortable.', type: 'open', points: 4, category: 'values', difficulty: 'medium', tags: ['transparency', 'accountability'] },
    { text: 'Which statement best reflects your view on accountability when a team fails to hit a goal?', type: 'mcq', options: ['The team lead is responsible', 'Each person is responsible only for their own part', 'Accountability is shared — the team owns outcomes collectively', 'Accountability depends on who made the original decision'], correctIndex: 2, points: 3, category: 'values', difficulty: 'medium', tags: ['accountability', 'teamwork'] },
    { text: 'How do you balance moving fast with maintaining quality and ethical standards?', type: 'open', points: 3, category: 'values', difficulty: 'medium', tags: ['quality', 'judgement', 'pace'] },
    { text: 'You disagree with a company policy but it is not unethical. How do you handle it?', type: 'mcq', options: ['Ignore it and do things your own way', 'Comply while raising your concern through proper channels', 'Refuse to follow it', 'Only follow it when being observed'], correctIndex: 1, points: 3, category: 'values', difficulty: 'medium', tags: ['compliance', 'integrity', 'communication'] },
  ],
  hard: [
    { text: 'You discover a practice within your team that is legal but inconsistent with the company\'s stated values around inclusion and fairness. No one else has raised it. What do you do and why?', type: 'open', points: 5, category: 'values', difficulty: 'hard', tags: ['inclusion', 'courage', 'leadership'] },
    { text: 'Describe a time when living by your values cost you something professionally — a relationship, an opportunity, or recognition. What did that experience teach you?', type: 'open', points: 5, category: 'values', difficulty: 'hard', tags: ['integrity', 'resilience', 'self-awareness'] },
    { text: 'A high-performing team member consistently achieves results but their approach undermines the team\'s psychological safety. How do you address this in a way that reflects the company\'s values?', type: 'open', points: 5, category: 'values', difficulty: 'hard', tags: ['leadership', 'inclusion', 'performance'] },
    { text: 'How would you describe the relationship between company culture and individual values? What happens when they conflict, and how have you navigated that?', type: 'open', points: 4, category: 'values', difficulty: 'hard', tags: ['culture', 'self-awareness', 'leadership'] },
  ],
}

const BANKS: Record<ModuleType, Record<Difficulty, GenQuestion[]>> = {
  aptitude: APTITUDE,
  technical: TECHNICAL,
  situational: SITUATIONAL,
  personality: PERSONALITY,
  values: VALUES,
}

export function generateQuestions(
  moduleType: ModuleType,
  difficulty: Difficulty,
  count: number,
  category?: string,
): GenQuestion[] {
  const pool = BANKS[moduleType]?.[difficulty] ?? []
  if (!pool.length) return []
  // Shuffle and slice
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  const selected = shuffled.slice(0, Math.min(count, pool.length))
  return selected.map((q) => ({
    ...q,
    category: category ?? q.category,
  }))
}

/**
 * Extract questions from plain text (parsed from PDF/DOCX).
 * Detects numbered lists, MCQ patterns, and open-ended question lines.
 */
export function extractQuestionsFromText(
  text: string,
  difficulty: Difficulty = 'medium',
  category = 'uploaded',
): GenQuestion[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 15)

  const questions: GenQuestion[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Detect numbered question: "1." / "Q1." / "Question 1:"
    const isQuestion = /^(Q\d+[\.\:\)]\s*|Question\s+\d+[\.\:\)]\s*|\d+[\.\:\)]\s+[A-Z])/i.test(line)
    if (isQuestion || line.endsWith('?')) {
      const questionText = line.replace(/^(Q\d+[\.\:\)]\s*|Question\s+\d+[\.\:\)]\s*|\d+[\.\:\)]\s+)/i, '').trim()
      if (questionText.length < 10) { i++; continue }

      // Look ahead for MCQ options (a), b), A., B.)
      const optionLines: string[] = []
      let j = i + 1
      while (j < lines.length && j < i + 6) {
        const optMatch = /^[A-Da-d][\.\:\)]\s+.+/.test(lines[j])
        if (optMatch) {
          optionLines.push(lines[j].replace(/^[A-Da-d][\.\:\)]\s+/, '').trim())
        } else {
          break
        }
        j++
      }

      if (optionLines.length >= 2) {
        // MCQ
        questions.push({
          text: questionText,
          type: 'mcq',
          options: optionLines,
          correctIndex: 0, // unknown from doc, default 0
          points: difficulty === 'hard' ? 3 : difficulty === 'medium' ? 2 : 1,
          category,
          difficulty,
          tags: ['imported'],
        })
        i = j
      } else {
        // Open question
        questions.push({
          text: questionText,
          type: 'open',
          points: difficulty === 'hard' ? 4 : difficulty === 'medium' ? 3 : 2,
          category,
          difficulty,
          tags: ['imported'],
        })
        i++
      }
    } else {
      i++
    }
  }

  return questions.slice(0, 50) // max 50 per upload
}
