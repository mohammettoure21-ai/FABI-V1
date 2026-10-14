export function Header({eyebrow,title,description}){return <header><div><small>{eyebrow}</small><h1>{title}</h1><p>{description}</p></div><span className="pill">FABI CONCIERGERIE</span></header>}
export function Messages({params}){return <>{params.erreur&&<div role="alert" className="notice error">{params.erreur}</div>}{params.succes&&<div role="status" className="notice">{params.succes}</div>}</>}
export function Input({label,name,type='text',required=true,...props}){return <label>{label}<input name={name} type={type} required={required} {...props}/></label>}
export function Select({label,name,options}){return <label>{label}<select name={name} required>{options.map(option=><option key={option} value={option}>{option}</option>)}</select></label>}
export function Empty({text}){return <div className="empty"><span>◇</span><h3>Aucune donnée pour le moment</h3><p>{text}</p></div>}
